 'use server';
 
 import { z } from 'zod';
 import prisma from '@/core/helpers/prisma';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getUserNeupIds, getUserProfile, checkPermissions } from '@/services/user';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';

/**
 * Type BranchAccount.
 */
export type BranchAccount = {
    id: string;
    name: string;
    neupId: string;
    location?: string;
};

const formSchema = z.object({
    name: z.string().min(1, 'Branch name is required'),
    neupIdSubdomain: z
        .string()
        .min(3, 'Subdomain must be at least 3 characters.')
        .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens.'),
    location: z.string().optional(),
});


/**
 * Function createBranchAccount.
 */
export async function createBranchAccount(data: z.infer<typeof formSchema>, geolocation?: string) {
    const canManage = await checkPermissions(['linked_accounts.brand.manage']);
    if (!canManage) {
        return { success: false, error: 'You do not have permission to create branch accounts.' };
    }

    const parentBrandId = await getActiveAccountId();
    if (!parentBrandId) {
        return { success: false, error: 'Managing brand account not found.' };
    }

    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        return { success: false, error: 'User not authenticated.' };
    }

    const validation = formSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: 'Invalid data provided.', details: validation.error.flatten() };
    }

    const { name, location } = validation.data;
    const neupIdSubdomain = validation.data.neupIdSubdomain.toLowerCase();
    const ipAddress = (await headers()).get('x-forwarded-for') || 'Unknown IP';

    try {
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
            return { success: false, error: 'This Branch NeupID is already taken.' };
        }

        const result = await prisma.$transaction(async (tx) => {
            const newAccount = await tx.account.create({
                data: {
                    accountType: 'branch',
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

            const branchAccountId = newAccount.id;

            await tx.permit.create({
                data: {
                    accountId: personalAccountId,
                    targetAccountId: branchAccountId,
                    forSelf: false,
                    isRoot: false,
                    permissions: ['individual.default'],
                    restrictions: [],
                }
            });

            // Grant brand.owner on the branch to the personal account (same role as brand)
            await tx.authzRole.upsert({
                where: { id: 'brand-owner-neup-account' },
                update: { name: 'brand.owner', scope: 'brand', appId: 'neup.account' },
                create: { id: 'brand-owner-neup-account', name: 'brand.owner', scope: 'brand', appId: 'neup.account' },
            });
            await tx.authzAccountAccessGrant.create({
                data: {
                    ownerAccountId: branchAccountId,
                    targetAccountId: personalAccountId,
                    roleId: 'brand-owner-neup-account',
                    appId: 'neup.account',
                },
            });

            await tx.neupId.create({
                data: {
                    id: fullNeupId,
                    neupId: fullNeupId,
                    accountId: branchAccountId,
                    isPrimary: true
                }
            });

            if (location) {
                await tx.contact.create({
                    data: {
                        accountId: branchAccountId,
                        contactType: 'branchLocation',
                        value: location,
                    }
                });
            }

            return branchAccountId;
        });

        await logActivity(parentBrandId, `Created Branch Account: ${fullNeupId}`, 'Success', ipAddress, personalAccountId, geolocation);
        revalidatePath(`/manage/brand/${parentBrandId}/branch`);

        return { success: true, branchId: result };
    } catch (error) {
        await logError('database', error, 'createBranchAccount');
        return { success: false, error: 'An unexpected error occurred during branch account creation.' };
    }
}


/**
 * Function checkBranchNeupIdAvailability.
 */
export async function checkBranchNeupIdAvailability(neupIdSubdomain: string): Promise<{ available: boolean; fullNeupId?: string }> {
    const parentBrandId = await getActiveAccountId();
    if (!parentBrandId) return { available: false };

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
        await logError('database', error, `checkBranchNeupIdAvailability: ${lowerSubdomain}`);
        return { available: false };
    }
}


/**
 * Function getBranches.
 */
export async function getBranches(brandId: string): Promise<BranchAccount[]> {
    if (!brandId) return [];

    const canManage = await checkPermissions(['linked_accounts.brand.manage']);
    if (!canManage) return [];

    try {
        const branches = await prisma.account.findMany({
            where: {
                childOwnerships: {
                    some: {
                        parentId: brandId,
                        type: 'branch',
                    },
                },
            },
            include: {
                contacts: {
                    where: { contactType: 'branchLocation' }
                },
                neupIds: {
                    where: { isPrimary: true }
                }
            }
        });

        return branches.map(branch => ({
            id: branch.id,
            name: branch.displayName || 'Unnamed Branch',
            neupId: branch.neupIds[0]?.id || 'N/A',
            location: branch.contacts[0]?.value || undefined,
        }));
    } catch (error) {
        await logError('database', error, `getBranches for ${brandId}`);
        return [];
    }
}
 
