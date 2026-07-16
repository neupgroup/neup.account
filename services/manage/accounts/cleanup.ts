'use server';

import prisma from '@/core/helpers/prisma';
import type { Prisma } from '@/prisma/generated/client/client';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/services/account/verify';
import { logError } from '@/logica/logger/files';
import { logActivity } from '@/services/log-actions';
import { revalidatePath } from 'next/cache';
import { permission } from '@/logica/permission';

export type ExpiredGuestAccount = {
    id: string;
    displayName: string | null;
    createdAt: string;
    status: string | null;
};

type Tx = Prisma.TransactionClient;

const servicePermissions = [
    permission('root.account.view', 'for_individual', 'service'),
    permission('root.account.delete', 'for_individual', 'service'),
];

async function tableExists(tx: Tx, qualifiedTableName: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ exists: string | null }>>`
        SELECT to_regclass(${qualifiedTableName})::text AS "exists"
    `;

    return Boolean(rows[0]?.exists);
}

async function deleteGuestAccountsByIds(accountIds: string[]): Promise<number> {
    if (accountIds.length === 0) return 0;

    const deleteResult = await prisma.$transaction(async (tx) => {
        const hasAuthzAssetsAccessGrant = await tableExists(tx, 'public.authz_assets_access_grant');

        await tx.account.updateMany({
            where: { linkedAccountId: { in: accountIds } },
            data: { linkedAccountId: null },
        });

        await tx.systemError.updateMany({
            where: { accountId: { in: accountIds } },
            data: { accountId: null },
        });

        await tx.verification.updateMany({
            where: { doneBy: { in: accountIds } },
            data: { doneBy: null },
        });

        await tx.role.deleteMany({ where: { accountId: { in: accountIds } } });
        if (hasAuthzAssetsAccessGrant) {
            await tx.authzAssetsAccessGrant.deleteMany({ where: { account_id: { in: accountIds } } });
        }
        await tx.request.deleteMany({
            where: {
                OR: [{ senderId: { in: accountIds } }, { recipientId: { in: accountIds } }],
            },
        });
        await tx.familyMember.deleteMany({ where: { memberId: { in: accountIds } } });
        await tx.connection.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.neupId.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.contact.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.authnSession.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.activity.deleteMany({
            where: {
                OR: [{ memberId: { in: accountIds } }, { actorAccountId: { in: accountIds } }],
            },
        });
        await tx.notification.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.verification.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.authnMethod.deleteMany({ where: { accountId: { in: accountIds } } });

        return tx.account.deleteMany({ where: { id: { in: accountIds } } });
    });

    return deleteResult.count;
}

/**
 * Returns all guest accounts with status 'expired'.
 * Requires root.account.view permission.
 */
export async function getExpiredGuestAccounts(): Promise<{ accounts: ExpiredGuestAccount[]; error?: string }> {
    const canView = await checkPermissions(['root.account.view']);
    if (!canView) return { accounts: [], error: 'Permission denied.' };

    try {
        const accounts = await prisma.account.findMany({
            where: {
                accountType: 'guest',
                status: 'expired',
            },
            select: {
                id: true,
                displayName: true,
                createdAt: true,
                status: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        return {
            accounts: accounts.map((a) => ({
                id: a.id,
                displayName: a.displayName,
                createdAt: a.createdAt.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                }),
                status: a.status,
            })),
        };
    } catch (error) {
        await logError('database', error, 'getExpiredGuestAccounts');
        return { accounts: [], error: 'Failed to fetch expired guest accounts.' };
    }
}

/**
 * Permanently deletes a single expired guest account and all its associated data.
 * Requires root.account.delete permission.
 */
export async function deleteExpiredGuestAccount(
    accountId: string,
): Promise<{ success: boolean; error?: string }> {
    const canDelete = await checkPermissions(['root.account.delete']);
    if (!canDelete) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        // Verify it is actually an expired guest before deleting
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            select: { accountType: true, status: true },
        });

        if (!account) return { success: false, error: 'Account not found.' };
        if (account.accountType !== 'guest') return { success: false, error: 'Account is not a guest account.' };
        if (account.status !== 'expired') return { success: false, error: 'Account is not expired.' };

        const deletedCount = await deleteGuestAccountsByIds([accountId]);
        if (deletedCount !== 1) {
            return { success: false, error: 'Account could not be deleted.' };
        }

        // Log on the admin's account — the deleted account no longer exists
        await logActivity(
            adminId,
            `Deleted expired guest account`,
            'Alert',
            undefined,
            adminId,
        );
        revalidatePath('/manage/accounts/cleanup');
        return { success: true };
    } catch (error) {
        await logError('database', error, `deleteExpiredGuestAccount: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred during deletion.' };
    }
}

/**
 * Permanently deletes ALL expired guest accounts in a single bulk operation.
 * Requires root.account.delete permission.
 */
export async function deleteAllExpiredGuestAccounts(): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
}> {
    const canDelete = await checkPermissions(['root.account.delete']);
    if (!canDelete) return { success: false, deletedCount: 0, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, deletedCount: 0, error: 'Administrator not authenticated.' };

    try {
        const expiredGuests = await prisma.account.findMany({
            where: { accountType: 'guest', status: 'expired' },
            select: { id: true },
        });

        if (expiredGuests.length === 0) {
            return { success: true, deletedCount: 0 };
        }

        const ids = expiredGuests.map((a) => a.id);

        const deletedCount = await deleteGuestAccountsByIds(ids);

        // Log on the admin's account with the full list of deleted IDs for audit trail
        await logActivity(
            adminId,
            `Bulk deleted ${ids.length} expired guest account(s)`,
            'Alert',
            undefined,
            adminId,
        );
        revalidatePath('/manage/accounts/cleanup');
        return { success: true, deletedCount };
    } catch (error) {
        await logError('database', error, 'deleteAllExpiredGuestAccounts');
        return { success: false, deletedCount: 0, error: 'An unexpected error occurred during bulk deletion.' };
    }
}
