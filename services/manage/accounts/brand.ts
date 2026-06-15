// @ts-nocheck
'use server';

import prisma from '@/core/helpers/prisma';
import { checkPermissions, getUserProfile } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { switchToBrand as switchToBrandAction, switchToPersonal as switchToPersonalAction } from '@/core/auth/session';
import { getPersonalAccountId } from '@/core/auth/verify';
import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { brandCreationSchema } from '@/services/manage/accounts/schema';
import { activeAccessWhere, ensureAccessAsset, ensureAccessMember } from '@/services/access-model';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { BRAND_OWNER_PERMISSION_NAMES, BRAND_OWNER_ROLE_ID, BRAND_OWNER_ROLE_NAME } from '@/core/auth/brand-roles';
import { assetTypeForRefs } from '@/services/access-model';

export type BrandAccount = {
    id: string;
    name: string;
    logoUrl?: string;
    plan: string;
};

/**
 * Function getBrandAccounts.
 * Returns all brand accounts where the personal account holds the brand.owner role.
 */
export async function getBrandAccounts(): Promise<BrandAccount[]> {
    await requireAnyPermission404(['linked_accounts.brand.view']);
    const canView = await checkPermissions(['linked_accounts.brand.view']);
    if (!canView) return [];

    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) return [];

    try {
        const grants = await prisma.access.findMany({
            where: {
                memberAccountId: personalAccountId,
                roleId: BRAND_OWNER_ROLE_ID,
                accessApplicationId: 'neup.account',
                parentAccount: { accountType: 'brand' },
                ...activeAccessWhere(),
            },
            select: { parentAccountId: true },
        });

        if (grants.length === 0) return [];

        const brandAccountIds = grants
            .map((g) => g.parentAccountId)
            .filter((id): id is string => Boolean(id));

        const brandAccountsData = await prisma.account.findMany({
            where: {
                id: { in: brandAccountIds },
                accountType: 'brand',
            },
        });

        if (brandAccountsData.length === 0) return [];

        const brandAccounts = await Promise.all(
            brandAccountsData.map(async (account) => {
                const profile = await getUserProfile(account.id);
                if (!profile) return null;
                return {
                    id: account.id,
                    name: profile.nameDisplay || 'Unnamed Brand',
                    logoUrl: profile.accountPhoto,
                    plan: 'Business',
                };
            })
        );

        return brandAccounts.filter((a): a is NonNullable<typeof a> => a !== null);

    } catch (error) {
        await logError('database', error, 'getBrandAccounts');
        return [];
    }
}


/**
 * Function createBrandAccount.
 * Creates the account, neupId, brand profile, optional contact, then grants brand ownership to the creator.
 */
export async function createBrandAccount(data: z.infer<typeof brandCreationSchema>, geolocation?: string) {
    await requireAnyPermission404(['linked_accounts.brand.create']);
    const canCreate = await checkPermissions(['linked_accounts.brand.create']);
    if (!canCreate) {
        return { success: false, error: 'You do not have permission to create a brand account.' };
    }

    const creatorAccountId = await getPersonalAccountId();
    if (!creatorAccountId) {
        return { success: false, error: 'User not authenticated.' };
    }

    const validation = brandCreationSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: 'Invalid data provided.', details: validation.error.flatten() };
    }

    const { nameBrand, nameLegal, registrationId, headOfficeLocation, servingAreas } = validation.data;
    const neupId = validation.data.neupId.toLowerCase();
    const ipAddress = (await headers()).get('x-forwarded-for') || 'Unknown IP';

    try {
        const existingNeupId = await prisma.neupId.findUnique({ where: { id: neupId } });
        if (existingNeupId) {
            return { success: false, error: 'This NeupID is already taken.' };
        }

        const brandAccountId = await prisma.$transaction(async (tx) => {
            // 1. Account row
            const account = await tx.account.create({
                data: {
                    accountType: 'brand',
                    status: 'active',
                    isVerified: false,
                    displayName: nameBrand,
                    displayImage: null,
                    details: {
                        nameLegal: nameLegal || null,
                        registrationId: registrationId || null,
                    },
                },
            });

            // 2. NeupID
            await tx.neupId.create({
                data: {
                    id: neupId,
                    neupId: neupId,
                    accountId: account.id,
                    isPrimary: true,
                },
            });

            // 3. Brand profile (account_meta__brand)
            await tx.accountTypeBrand.create({
                data: {
                    accountId: account.id,
                    brandName: nameBrand,
                    isLegalEntity: Boolean(nameLegal || registrationId),
                    originCountry: servingAreas || null,
                },
            });

            // 4. Head office contact (optional)
            if (headOfficeLocation) {
                await tx.contact.create({
                    data: {
                        accountId: account.id,
                        contactType: 'headOfficeLocation',
                        value: headOfficeLocation,
                    },
                });
            }

            // 5. Ensure the brand owner role exists and seed its permissions
            await tx.authzRole.upsert({
                where: { id: BRAND_OWNER_ROLE_ID },
                update: {
                    name: BRAND_OWNER_ROLE_NAME,
                    description: 'Brand ownership role for brand accounts.',
                    scope: 'brand',
                    appId: 'neup.account',
                    permissions: BRAND_OWNER_PERMISSION_NAMES,
                },
                create: {
                    id: BRAND_OWNER_ROLE_ID,
                    name: BRAND_OWNER_ROLE_NAME,
                    description: 'Brand ownership role for brand accounts.',
                    scope: 'brand',
                    appId: 'neup.account',
                    permissions: BRAND_OWNER_PERMISSION_NAMES,
                },
            });

            const member = await ensureAccessMember(tx, {
                childAccountId: creatorAccountId,
                parentAccountId: account.id,
            });

            const asset = await ensureAccessAsset(tx, {
                parentAccountId: account.id,
                childAccountId: account.id,
            });

            await tx.access.create({
                data: {
                    accessType: assetTypeForRefs(
                        { parentAccountId: account.id },
                        { childAccountId: account.id },
                    ),
                    memberId: member.id,
                    memberAccountId: creatorAccountId,
                    parentAccountId: account.id,
                    assetId: asset.id,
                    assetAccountId: account.id,
                    accessApplicationId: 'neup.account',
                    roleId: BRAND_OWNER_ROLE_ID,
                    status: 'active',
                },
            });

            return account.id;
        });

        await logActivity(
            creatorAccountId,
            activityAction.accountBrandCreate(brandAccountId),
            'Success',
            ipAddress,
            undefined,
            geolocation
        );
        revalidatePath('/accounts/brand');

        return { success: true };

    } catch (error) {
        await logError('database', error, `createBrandAccount failed for neupId: ${neupId}`);
        return { success: false, error: 'An unexpected error occurred during brand account creation.' };
    }
}


/**
 * Function switchToBrand.
 */
export async function switchToBrand(brandId: string) {
    try {
        return await switchToBrandAction(brandId);
    } catch (error) {
        await logError('auth', error, `switchToBrand: ${brandId}`);
        return { success: false, error: 'Failed to switch to brand account.' };
    }
}


/**
 * Function switchToPersonal.
 */
export async function switchToPersonal() {
    try {
        await switchToPersonalAction();
    } catch (error) {
        await logError('auth', error, `switchToPersonal`);
    }
}
