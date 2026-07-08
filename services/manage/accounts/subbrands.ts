// @ts-nocheck
'use server';
 
 import { permission } from '@/neup.logica/permission';
 import { z } from 'zod';
 import prisma from '@/core/helpers/prisma';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { getUserNeupIds, getUserProfile, checkPermissions } from '@/services/user';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { activityAction } from '@/services/activity-action';
import { ensureAccessGrant } from '@/services/access-model';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';
import {
    BRAND_OWNER_PERMISSION_NAMES,
    BRAND_OWNER_ROLE_ID,
    BRAND_OWNER_ROLE_NAME,
} from '@/core/auth/brand-roles';

const servicePermissions = [
    permission('linked_accounts.brand.manage', 'for_brand', 'service'),
];

/**
 * Type SubbrandAccount.
 */
export type SubbrandAccount = {
    id: string;
    name: string;
    neupId: string;
    location?: string;
};

const formSchema = z.object({
    name: z.string().min(1, 'Subbrand name is required'),
    neupIdSubdomain: z
        .string()
        .min(3, 'Subdomain must be at least 3 characters.')
        .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens.'),
    location: z.string().optional(),
});


/**
 * Function createSubbrandAccount.
 */
export async function createSubbrandAccount(
    data: z.infer<typeof formSchema>,
    managerAccountId?: string | null,
    geolocation?: string,
) {
    const accessContext = await resolveAccessProfileContext({
        selectedProfile: managerAccountId,
        requiredPermissions: ['linked_accounts.brand.manage'],
    });

    if (!accessContext) {
        return { success: false, error: 'You do not have permission to create subbrand accounts.' };
    }

    const parentBrandId = accessContext.selectedProfile;
    if (!parentBrandId) {
        return { success: false, error: 'Managing brand account not found.' };
    }

    const actorAccountId = accessContext.signedInProfile;
    if (!actorAccountId) {
        return { success: false, error: 'User not authenticated.' };
    }

    const validation = formSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: 'Invalid data provided.', details: validation.error.flatten() };
    }

    const { name, location } = validation.data;
    const neupIdSubdomain = validation.data.neupIdSubdomain.toLowerCase();

    try {
        const parentProfile = await getUserProfile(parentBrandId);
        if (parentProfile?.accountType !== 'brand' && parentProfile?.accountType !== 'subbrand') {
            return { success: false, error: 'Subbrand accounts can only be created under a brand account.' };
        }

        const parentNeupIds = await getUserNeupIds(parentBrandId);
        if (parentNeupIds.length === 0) {
            return { success: false, error: 'Parent brand does not have a NeupID.' };
        }
        const parentNeupId = parentNeupIds[0];
        const fullNeupId = `${parentNeupId}.${neupIdSubdomain}`;

        const existingNeupId = await prisma.neupId.findUnique({
            where: { id: fullNeupId }
        });
        
        if (existingNeupId) {
            return { success: false, error: 'This subbrand NeupID is already taken.' };
        }

        const result = await prisma.$transaction(async (tx) => {
            const newAccount = await tx.account.create({
                data: {
                    accountType: 'subbrand',
                    status: 'active',
                    isVerified: false,
                    displayName: name,
                    brandProfile: {
                        create: {
                            brandName: name,
                            isLegalEntity: false,
                            originCountry: null,
                        },
                    },
                }
            });

            const subbrandAccountId = newAccount.id;

            await tx.permit.create({
                data: {
                    accountId: parentBrandId,
                    memberId: subbrandAccountId,
                    forSelf: false,
                    isRoot: false,
                    permissions: ['individual.default'],
                    restrictions: [],
                }
            });

            await tx.accountOwnership.create({
                data: {
                    parentId: parentBrandId,
                    childrenId: subbrandAccountId,
                    type: 'subbrand',
                },
            });

            // Grant the canonical managed brand owner role on the subbrand.
            await tx.authzRole.upsert({
                where: { id: BRAND_OWNER_ROLE_ID },
                update: {
                    name: BRAND_OWNER_ROLE_NAME,
                    description: 'Brand ownership role for brand accounts.',
                    scope: 'managed.brand',
                    appId: 'neup.account',
                    permissions: BRAND_OWNER_PERMISSION_NAMES,
                },
                create: {
                    id: BRAND_OWNER_ROLE_ID,
                    name: BRAND_OWNER_ROLE_NAME,
                    description: 'Brand ownership role for brand accounts.',
                    scope: 'managed.brand',
                    appId: 'neup.account',
                    permissions: BRAND_OWNER_PERMISSION_NAMES,
                },
            });
            await ensureAccessGrant(tx, {
                memberAccountId: parentBrandId,
                parentAccountId: subbrandAccountId,
                childAccountId: subbrandAccountId,
                accessApplicationId: 'neup.account',
                roleId: BRAND_OWNER_ROLE_ID,
            });

            await tx.neupId.create({
                data: {
                    id: fullNeupId,
                    neupId: fullNeupId,
                    accountId: subbrandAccountId,
                    isPrimary: true
                }
            });

            if (location) {
                await tx.contact.create({
                    data: {
                        accountId: subbrandAccountId,
                        contactType: 'subbrandLocation',
                        value: location,
                    }
                });
            }

            return subbrandAccountId;
        });

        await logActivity(
            parentBrandId,
            activityAction.accountSubbrandCreate(result),
            'Success',
            undefined,
            actorAccountId,
            geolocation
        );
        revalidatePath(`/access?selectedProfile=${parentBrandId}`);
        revalidatePath(`/access/subbrands?selectedProfile=${parentBrandId}`);

        return { success: true, subbrandId: result };
    } catch (error) {
        await logError('database', error, 'createSubbrandAccount');
        return { success: false, error: 'An unexpected error occurred during subbrand account creation.' };
    }
}


/**
 * Function checkSubbrandNeupIdAvailability.
 */
export async function checkSubbrandNeupIdAvailability(
    neupIdSubdomain: string,
    managerAccountId?: string | null,
): Promise<{ available: boolean; fullNeupId?: string }> {
    const accessContext = await resolveAccessProfileContext({
        selectedProfile: managerAccountId,
        requiredPermissions: ['linked_accounts.brand.manage'],
    });
    if (!accessContext) return { available: false };

    const parentBrandId = accessContext.selectedProfile;

    const lowerSubdomain = neupIdSubdomain.toLowerCase();

    if (!lowerSubdomain || lowerSubdomain.length < 3 || !/^[a-z0-9-]+$/.test(lowerSubdomain)) {
        return { available: false };
    }

    try {
        const parentNeupIds = await getUserNeupIds(parentBrandId);
        if (parentNeupIds.length === 0) {
            return { available: false };
        }
        const parentNeupId = parentNeupIds[0];
        const fullNeupId = `${parentNeupId}.${lowerSubdomain}`;

        const count = await prisma.neupId.count({
            where: { id: fullNeupId }
        });

        return { available: count === 0, fullNeupId };
    } catch (error) {
        await logError('database', error, `checkSubbrandNeupIdAvailability: ${lowerSubdomain}`);
        return { available: false };
    }
}


/**
 * Function getSubbrands.
 */
export async function getSubbrands(
    brandId: string,
    options: { skipPermissionCheck?: boolean } = {},
): Promise<SubbrandAccount[]> {
    if (!brandId) return [];

    if (!options.skipPermissionCheck) {
        await requireAnyPermission404(['linked_accounts.brand.manage']);
        const canManage = await checkPermissions(['linked_accounts.brand.manage']);
        if (!canManage) return [];
    }

    try {
        const subbrands = await prisma.account.findMany({
            where: {
                childOwnerships: {
                    some: {
                        parentId: brandId,
                        type: { in: ['branch', 'subbrand'] },
                    },
                },
            },
            include: {
                contacts: {
                    where: { contactType: { in: ['branchLocation', 'subbrandLocation'] } }
                },
                neupIds: {
                    where: { isPrimary: true }
                }
            }
        });

        return subbrands.map((subbrand) => ({
            id: subbrand.id,
            name: subbrand.displayName || 'Unnamed Subbrand',
            neupId: subbrand.neupIds[0]?.id || 'N/A',
            location: subbrand.contacts[0]?.value || undefined,
        }));
    } catch (error) {
        await logError('database', error, `getSubbrands for ${brandId}`);
        return [];
    }
}
 
