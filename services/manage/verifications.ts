'use server';

import prisma from '@/core/helpers/prisma';
import { getUserProfile, checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getPersonalAccountId } from '@/core/auth/verify';
import { activityAction } from '@/services/activity-action';

export type VerificationRequest = {
    id: string;
    accountId: string;
    fullName: string;
    neupId: string;
    requestedAt: string;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
};

const verificationActionSchema = z.object({
    reason: z.string().min(10, "A reason of at least 10 characters is required."),
    category: z.string().min(3, "Category is required."),
});

/**
 * Function getPendingVerificationRequests.
 */
export async function getPendingVerificationRequests(): Promise<VerificationRequest[]> {
    const canView = await checkPermissions(['root.requests.view']);
    if (!canView) return [];

    try {
        const verifications = await prisma.verification.findMany({
            where: { status: 'pending' },
            include: { account: true }
        });

        const requests = verifications.map(v => {
            const profile = v.account;
            return {
                id: v.id,
                accountId: v.accountId,
                fullName: profile?.displayName || 'Unknown User',
                neupId: 'N/A',
                requestedAt: v.createdAt.toLocaleDateString() || 'N/A',
                status: v.status as VerificationRequest['status'],
            };
        });
        return requests;
    } catch (error) {
        await logError('database', error, 'getPendingVerificationRequests');
        return [];
    }
}


/**
 * Function grantVerification.
 */
export async function grantVerification(accountId: string, data: z.infer<typeof verificationActionSchema>): Promise<{ success: boolean; error?: string }> {
    const canApprove = await checkPermissions(['root.requests.approve']);
    if (!canApprove) return { success: false, error: 'Permission denied.' };
    
    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Admin not authenticated.'};

    if (adminId === accountId) {
        return { success: false, error: 'Administrators cannot verify their own account.' };
    }

    const validation = verificationActionSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.reason?.[0] || validation.error.flatten().fieldErrors.category?.[0] };
    }

    const { reason, category } = validation.data;

    try {
        await prisma.$transaction([
            // Update account document
            prisma.account.update({
                where: { id: accountId },
                data: { isVerified: true }
            }),
            // Set verification details in verifications collection
            prisma.verification.upsert({
                where: { id: accountId }, // Using accountId as ID for account verification to match Firestore logic
                update: {
                    status: 'approved',
                    doneBy: adminId,
                    doneAt: new Date(),
                    reason,
                    category
                },
                create: {
                    id: accountId,
                    accountId,
                    status: 'approved',
                    doneBy: adminId,
                    doneAt: new Date(),
                    reason,
                    category
                }
            })
        ]);

        await logActivity(accountId, activityAction.verificationApproved(category), 'Success', undefined, adminId);
        revalidatePath('/manage/[id]', 'page');
        return { success: true };
    } catch (error) {
        await logError('database', error, `grantVerification: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function revokeVerification.
 */
export async function revokeVerification(accountId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const canDeny = await checkPermissions(['root.requests.deny']);
    if (!canDeny) return { success: false, error: 'Permission denied.' };
    
    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Admin not authenticated.'};

    if (!reason || reason.length < 10) {
        return { success: false, error: "A reason of at least 10 characters is required to revoke." };
    }

    try {
        await prisma.$transaction([
            prisma.account.update({
                where: { id: accountId },
                data: { isVerified: false }
            }),
            prisma.verification.update({
                where: { id: accountId },
                data: {
                    status: 'revoked',
                    doneBy: adminId,
                    doneAt: new Date(),
                    reason
                }
            })
        ]);

        await logActivity(accountId, 'Account Verification Revoked', 'Alert', undefined, adminId);
        revalidatePath('/manage/[id]', 'page');
        return { success: true };
    } catch (error) {
        await logError('database', error, `revokeVerification: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function getAccountVerification.
 */
export async function getAccountVerification(accountId: string): Promise<{ verified: boolean; category?: string; verifiedAt?: string } | null> {
    try {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            select: { isVerified: true }
        });

        if (!account || !account.isVerified) {
            return { verified: false };
        }

        const verification = await prisma.verification.findUnique({
            where: { id: accountId }
        });

        return {
            verified: true,
            category: verification?.category || 'Standard',
            verifiedAt: verification?.doneAt?.toLocaleDateString() || 'N/A'
        };
    } catch (error) {
        await logError('database', error, `getAccountVerification: ${accountId}`);
        return null;
    }
}
