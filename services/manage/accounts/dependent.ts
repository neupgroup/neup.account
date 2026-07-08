// @ts-nocheck
'use server';

import { permission } from '@/logica/permission';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { dependentFormSchema } from '@/services/manage/accounts/schema';
import { ensureAccessGrant } from '@/services/access-model';
import { checkPermissions, getUserProfile, getUserNeupIds } from '@/services/user';
import { activityAction } from '@/services/activity-action';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';
import {
  ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS,
  ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS,
} from '@/core/auth/access-view-permissions';

const servicePermissions = [
  permission('access.linked_account.view.self', 'for_individual', 'service'),
  permission('access.account.dependent.create.self', 'for_individual', 'service'),
];


/**
 * Type DependentAccount.
 */
export type DependentAccount = {
    id: string;
    nameDisplay?: string;
    neupId?: string;
    accountPhoto?: string;
};


/**
 * Function getDependentAccounts.
 */
export async function getDependentAccounts(): Promise<DependentAccount[]> {
    await requireAnyPermission404([...ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS]);
    const canView = await checkPermissions([...ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS]);
    if (!canView) return [];
    
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        return [];
    }

    try {
        // Find dependent accounts where the personal account holds account.guardian
        const grants = await prisma.member.findMany({
            where: {
                memberId: personalAccountId,
                roleId: 'account.guardian',
                appId: 'neup.account',
            },
            select: { accessTo: true },
        });

        if (grants.length === 0) return [];

        const dependentAccountIds = grants.map((g) => g.accessTo);

        const dependentAccountsData = await prisma.account.findMany({
            where: {
                id: { in: dependentAccountIds },
                accountType: 'dependent',
            },
        });

        if (dependentAccountsData.length === 0) return [];
        
        const dependentAccounts = await Promise.all(
            dependentAccountsData.map(async (account) => {
                const accountId = account.id;
                const profile = await getUserProfile(accountId);

                if (!profile) return null;

                return {
                    id: accountId,
                    nameDisplay: profile.nameDisplay || `${profile.nameFirst} ${profile.nameLast}`.trim(),
                    neupId: profile.neupIdPrimary || 'N/A',
                    accountPhoto: profile.accountPhoto,
                };
            })
        );
        
        return dependentAccounts.filter((account): account is NonNullable<typeof account> => account !== null);

    } catch (error) {
        await logError('database', error, 'getDependentAccounts');
        return [];
    }
}


/**
 * Function createDependentAccount.
 */
export async function createDependentAccount(
    data: z.infer<typeof dependentFormSchema>,
    managerAccountId?: string | null,
    geolocation?: string,
) {
    const accessContext = await resolveAccessProfileContext({
        selectedProfile: managerAccountId,
        requiredPermissions: ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS,
    });

    if (!accessContext) {
        return { success: false, error: "You do not have permission to create a dependent account." };
    }

    const guardianAccountId = accessContext.selectedProfile;
    const actorAccountId = accessContext.signedInProfile;
    if (!guardianAccountId || !actorAccountId) {
        return { success: false, error: "Guardian not authenticated." };
    }

    const validation = dependentFormSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided.", details: validation.error.flatten() };
    }

    const { password, agreement, ...profileData } = validation.data;
    const neupId = profileData.neupId.toLowerCase();

    try {
        const existingNeupId = await prisma.neupId.findUnique({
            where: { id: neupId }
        });
        
        if (existingNeupId) {
            return { success: false, error: 'This NeupID is already taken.' };
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);

        const dependentAccountId = await prisma.$transaction(async (tx) => {
            const account = await tx.account.create({
                data: {
                    accountType: 'dependent',
                    status: 'active',
                    isVerified: false,
                    displayName: `${profileData.firstName} ${profileData.lastName}`.trim(),
                    displayImage: null,
                    details: {
                        gender: profileData.gender,
                    },
                    individualProfile: {
                        create: {
                            firstName: profileData.firstName,
                            middleName: profileData.middleName || null,
                            lastName: profileData.lastName,
                            dateOfBirth: new Date(profileData.dob),
                            countryOfResidence: profileData.nationality,
                        },
                    },
                    authMethods: {
                        create: {
                            type: 'password',
                            order: 'primary',
                            status: 'active',
                            value: hashedPassword,
                        },
                    },
                    neupIds: {
                        create: {
                            id: neupId,
                            neupId: neupId,
                            isPrimary: true,
                        },
                    },
                },
            });

            const accountId = account.id;

            // Ensure delegation roles exist
            await tx.authzRole.upsert({
                where: { id: 'account.guardian' },
                update: {
                    name: 'account.guardian',
                    scope: 'account',
                    appId: 'neup.account',
                    permissions: ['access.connection.create.dependent.managed'],
                },
                create: {
                    id: 'account.guardian',
                    name: 'account.guardian',
                    scope: 'account',
                    appId: 'neup.account',
                    permissions: ['access.connection.create.dependent.managed'],
                },
            });
            await tx.authzRole.upsert({
                where: { id: 'account.dependent' },
                update: {
                    name: 'account.dependent',
                    scope: 'account',
                    appId: 'neup.account',
                    permissions: ['access.connection.create.dependent.self'],
                },
                create: {
                    id: 'account.dependent',
                    name: 'account.dependent',
                    scope: 'account',
                    appId: 'neup.account',
                    permissions: ['access.connection.create.dependent.self'],
                },
            });

            await ensureAccessGrant(tx, {
                memberAccountId: guardianAccountId,
                parentAccountId: accountId,
                childAccountId: accountId,
                accessApplicationId: 'neup.account',
                roleId: 'account.guardian',
            });

            await ensureAccessGrant(tx, {
                memberAccountId: accountId,
                parentAccountId: accountId,
                childAccountId: accountId,
                accessApplicationId: 'neup.account',
                roleId: 'account.dependent',
            });

            return accountId;
        });

        await logActivity(
            guardianAccountId,
            activityAction.accountDependentCreate(dependentAccountId),
            'Success',
            undefined,
            actorAccountId,
            geolocation
        );
        revalidatePath(`/access?selectedProfile=${guardianAccountId}`);

        return { success: true, dependentId: dependentAccountId };

    } catch (error) {
        await logActivity(guardianAccountId, `Dependent account creation failed: ${neupId}`, 'Failed', undefined, actorAccountId, geolocation);
        await logError('database', error, 'createDependentAccount');
        return { success: false, error: 'An unexpected error occurred during account creation.' };
    }
}
