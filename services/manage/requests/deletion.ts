'use server';

import prisma from '@/core/helpers/prisma';
import { getUserProfile, checkPermissions, isRootUser } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { deleteUserAccount } from '@/services/manage/users';
import { getPersonalAccountId } from '@/services/account/verify';
import { logActivity } from '@/services/log-actions';
import { z } from 'zod';
import { permission } from '@/logica/permission';

/**
 * Type DeletionRequest.
 */
export type DeletionRequest = {
  accountId: string;
  userFullName: string;
  userNeupId: string;
  requestedAt: string;
};

const requestByAdminSchema = z.object({
    reason: z.string().min(10, "A reason of at least 10 characters is required."),
});

const servicePermissions = [
  permission('requests.root_approval.view', 'for_individual', 'service'),
  permission('root.account.delete', 'for_individual', 'service'),
  permission('requests.root_approval.approve', 'for_individual', 'service'),
];


/**
 * Function getDeletionRequests.
 */
export async function getDeletionRequests(): Promise<DeletionRequest[]> {
  const canView = await checkPermissions(['requests.root_approval.view']);
  if (!canView) return [];

  try {
    const accounts = await prisma.account.findMany({
            where: { status: 'deletion_requested' }
    });

    if (accounts.length === 0) {
      return [];
    }

    const requests = await Promise.all(
      accounts.map(async (account) => {
        const accountId = account.id;
        const profile = await getUserProfile(accountId);

        const statusLog = await prisma.activity.findFirst({
            where: {
                memberId: accountId,
                action: {
                    contains: 'Account status changed to deletion_requested',
                },
            },
            orderBy: { timestamp: 'desc' }
        });
        const requestedAt = statusLog?.timestamp?.toLocaleDateString() || 'N/A';

        return {
          accountId,
          userFullName:
            profile?.nameDisplay ||
            `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() ||
            'Unknown User',
          userNeupId: profile?.neupIdPrimary || 'N/A',
          requestedAt,
        };
      })
    );
    return requests;
  } catch (error) {
    await logError('database', error, 'getDeletionRequests');
    return [];
  }
}


/**
 * Function getDeletionStatus.
 */
export async function getDeletionStatus(accountId: string): Promise<{status: 'none' | 'pending' | 'deleted' | 'is_root', requestedAt?: string | null}> {
    try {
        const isTargetRoot = await isRootUser(accountId);
        if (isTargetRoot) {
            return { status: 'is_root' };
        }

        const account = await prisma.account.findUnique({
            where: { id: accountId }
        });

        if (!account) {
            return { status: 'deleted' };
        }

        const status = account.status;
        if (status === 'deletion_requested') {
            const statusLog = await prisma.activity.findFirst({
                where: {
                    memberId: accountId,
                    action: {
                        contains: 'Account status changed to deletion_requested',
                    },
                },
                orderBy: { timestamp: 'desc' }
            });
            const requestedAt = statusLog?.timestamp?.toLocaleDateString() || null;
            return { status: 'pending', requestedAt };
        }

        return { status: 'none' };
    } catch (error) {
        await logError('database', error, `getDeletionStatus for ${accountId}`);
        return { status: 'none' };
    }
}


/**
 * Function approveAccountDeletion.
 */
export async function approveAccountDeletion(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
    const canApprove = await checkPermissions(['root.account.delete']);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Admin not authenticated.'};

    try {
        const result = await deleteUserAccount(accountId);
        if (result.success) {
            revalidatePath('/manage/requests/deletion');
             revalidatePath(`/manage/${accountId}`);
            return { success: true };
        } else {
            return { success: false, error: result.error };
        }
    } catch (error) {
         await logError('database', error, `approveAccountDeletion: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function cancelAccountDeletion.
 */
export async function cancelAccountDeletion(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
    const canCancel = await checkPermissions(['requests.root_approval.approve']);
    if (!canCancel) return { success: false, error: 'Permission denied.' };
    
    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Admin not authenticated.'};

    try {
        await prisma.$transaction(async (tx) => {
            await tx.account.update({
                where: { id: accountId },
                data: { status: 'active' }
            });

            await tx.activity.create({
                data: {
                    memberId: accountId,
                    actorAccountId: adminId,
                    action: 'Account status changed to active. Request cancelled by admin.',
                    status: 'Success',
                    ip: 'system',
                    timestamp: new Date(),
                    geolocation: `Request cancelled by admin ${adminId}.`,
                }
            });
        });

        await logActivity(accountId, 'Account Deletion Cancelled by Admin', 'Success', undefined, adminId);
        revalidatePath('/manage/requests/deletion');
        revalidatePath(`/manage/${accountId}/deletion`);
        return { success: true };
    } catch (error) {
        await logError('database', error, `cancelAccountDeletion: ${accountId}`);
        return { success: false, error: 'Failed to cancel deletion request.' };
    }
}


/**
 * Function requestAccountDeletionByAdmin.
 */
export async function requestAccountDeletionByAdmin(accountId: string, data: z.infer<typeof requestByAdminSchema>): Promise<{ success: boolean; error?: string; }> {
    const canDelete = await checkPermissions(['root.account.delete']);
    if (!canDelete) {
        return { success: false, error: "Permission denied." };
    }
    
    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.'};
    
    const validation = requestByAdminSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.reason?.[0] };
    }

    try {
        const isTargetRoot = await isRootUser(accountId);
        if (isTargetRoot) {
            return { success: false, error: "Root user accounts cannot be deleted this way." };
        }

        await prisma.$transaction(async (tx) => {
            await tx.account.update({
                where: { id: accountId },
                data: { status: 'deletion_requested' }
            });

            await tx.activity.create({
                data: {
                    memberId: accountId,
                    actorAccountId: adminId,
                    action: `Account status changed to deletion_requested. Admin initiated deletion. Reason: ${validation.data.reason}`,
                    status: 'Pending',
                    ip: 'system',
                    timestamp: new Date(),
                    geolocation: `Request by admin: ${adminId}.`,
                }
            });
        });

        await logActivity(accountId, "Account Deletion Requested by Admin", "Alert", undefined, adminId);
        revalidatePath(`/manage/${accountId}/deletion`);
        return { success: true };

    } catch (error) {
        await logError("database", error, `requestAccountDeletionByAdmin: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}
