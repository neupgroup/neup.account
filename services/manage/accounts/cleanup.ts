'use server';

import prisma from '@/core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { logActivity } from '@/services/log-actions';
import { revalidatePath } from 'next/cache';

export type ExpiredGuestAccount = {
    id: string;
    displayName: string | null;
    createdAt: string;
    status: string | null;
};

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

        await prisma.$transaction([
            prisma.neupId.deleteMany({ where: { accountId } }),
            prisma.contact.deleteMany({ where: { accountId } }),
            prisma.authnSession.deleteMany({ where: { accountId } }),
            prisma.activity.deleteMany({ where: { OR: [{ memberId: accountId }, { actorAccountId: accountId }] } }),
            prisma.notification.deleteMany({ where: { accountId } }),
            prisma.verification.deleteMany({ where: { accountId } }),
            prisma.authnMethod.deleteMany({ where: { accountId } }),
            prisma.account.delete({ where: { id: accountId } }),
        ]);

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

        await prisma.$transaction([
            prisma.neupId.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.contact.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.authnSession.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.activity.deleteMany({ where: { OR: [{ memberId: { in: ids } }, { actorAccountId: { in: ids } }] } }),
            prisma.notification.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.verification.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.authnMethod.deleteMany({ where: { accountId: { in: ids } } }),
            prisma.account.deleteMany({ where: { id: { in: ids } } }),
        ]);

        // Log on the admin's account with the full list of deleted IDs for audit trail
        await logActivity(
            adminId,
            `Bulk deleted ${ids.length} expired guest account(s)`,
            'Alert',
            undefined,
            adminId,
        );
        revalidatePath('/manage/accounts/cleanup');
        return { success: true, deletedCount: ids.length };
    } catch (error) {
        await logError('database', error, 'deleteAllExpiredGuestAccounts');
        return { success: false, deletedCount: 0, error: 'An unexpected error occurred during bulk deletion.' };
    }
}
