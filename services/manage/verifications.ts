'use server';

import { permission } from '@/neup.logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { getUserProfile, checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getPersonalAccountId } from '@/neup.core/auth/verify';
import { activityAction } from '@/services/activity-action';

const servicePermissions = [
    permission('requests.root_approval.view', 'for_individual', 'service'),
    permission('requests.root_approval.approve', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-verifications-module
 * ::title Verification Management Service
 *
 * Loads and mutates account verification state for root reviewers.
 *
 * ::public
 *
 * Use this service to list pending verification requests, grant or revoke verification, and read the current verification state for an account.
 *
 * ::public end
 *
 * ::private
 *
 * The service coordinates `account.isVerified`, verification records, activity logs, and route revalidation for the manage UI.
 *
 * ::private end
 *
 * ::end
 */

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
    /**
     * ::neup.documentation::manage-verifications-get-pending
     * ::function getPendingVerificationRequests()
     *
     * Returns the pending verification requests awaiting review.
     *
     * ::public
     *
     * Each result includes the target account, display name, requested time, and current status.
     *
     * ::public end
     *
     * ::private
     *
     * The current implementation reads pending rows from the `verification` table and maps account display names onto them.
     *
     * ::private end
     *
     * ::end
     */
    const canView = await checkPermissions(['requests.root_approval.view']);
    if (!canView) return [];

    try {
        const verifications = await prisma.verification.findMany({
            where: { status: 'pending' },
            select: {
                id: true,
                accountId: true,
                status: true,
                doneAt: true,
                account: {
                    select: {
                        displayName: true,
                    },
                },
            }
        });

        const requests = verifications.map(v => {
            const profile = v.account;
            return {
                id: v.id,
                accountId: v.accountId,
                fullName: profile?.displayName || 'Unknown User',
                neupId: 'N/A',
                requestedAt: v.doneAt?.toLocaleDateString() || 'N/A',
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
    /**
     * ::neup.documentation::manage-verifications-grant
     * ::function grantVerification(accountId, data)
     *
     * Grants account verification with a reviewer reason and category.
     *
     * ::public
     *
     * Reviewers can use this to verify an account and record the category and justification for the approval.
     *
     * ::public end
     *
     * ::private
     *
     * Self-verification is blocked and the mutation updates both the account flag and the verification record in one transaction.
     *
     * ::private end
     *
     * ::end
     */
    const canApprove = await checkPermissions(['requests.root_approval.approve']);
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
    /**
     * ::neup.documentation::manage-verifications-revoke
     * ::function revokeVerification(accountId, reason)
     *
     * Revokes verification for an account.
     *
     * ::public
     *
     * Callers must provide a sufficiently detailed reason when removing verification.
     *
     * ::public end
     *
     * ::private
     *
     * Revocation clears the account verification flag and updates the matching verification record with reviewer metadata.
     *
     * ::private end
     *
     * ::end
     */
    const canDeny = await checkPermissions(['requests.root_approval.approve']);
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
    /**
     * ::neup.documentation::manage-verifications-get-account-verification
     * ::function getAccountVerification(accountId)
     *
     * Returns the current verification status for one account.
     *
     * ::public
     *
     * Verified accounts include category and verification date when available.
     *
     * ::public end
     *
     * ::private
     *
     * The helper first checks `account.isVerified` and only then looks up the backing verification record.
     *
     * ::private end
     *
     * ::end
     */
    try {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            select: { isVerified: true }
        });

        if (!account || !account.isVerified) {
            return { verified: false };
        }

        const verification = await prisma.verification.findUnique({
            where: { id: accountId },
            select: {
                category: true,
                doneAt: true,
            },
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
