'use server';

import { permission } from '@/.neup/logica/permission';
import prisma from '@/.neup/core/database/prisma';
import { getUserProfile, checkPermissions, getUserNeupIds } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/.neup/logica/logger/files';
import { revalidatePath } from 'next/cache';
import { activityAction } from '@/services/activity-action';

const servicePermissions = [
    permission('requests.root_approval.view', 'for_individual', 'service'),
    permission('requests.root_approval.approve', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-kyc-requests-module
 * ::title KYC Request Service
 *
 * Loads and processes pending KYC approval requests.
 *
 * ::public
 *
 * Use this service from root request-review surfaces to inspect submitted KYC evidence and approve or reject the request.
 *
 * ::public end
 *
 * ::private
 *
 * Approval updates both the request row and the target account verification flag, while rejection only updates the request state and logs activity.
 *
 * ::private end
 *
 * ::end
 */
export type KycRequest = {
    id: string;
    accountId: string;
    userFullName: string;
    userNeupId: string;
    documentType: string;
    submittedAt: string;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    documentPhotoUrl: string;
    selfiePhotoUrl: string;
};


/**
 * Function getPendingKycRequests.
 */
export async function getPendingKycRequests(): Promise<KycRequest[]> {
    /**
     * ::neup.documentation::manage-kyc-requests-get-pending
     * ::function getPendingKycRequests()
     *
     * Returns the pending KYC requests awaiting review.
     *
     * ::public
     *
     * Each result includes the requester account, their NeupID, document type, submitted time, and evidence URLs.
     *
     * ::public end
     *
     * ::private
     *
     * Request data is assembled from pending `request` rows plus profile and NeupID lookups for the sender account.
     *
     * ::private end
     *
     * ::end
     */
    const canView = await checkPermissions(['requests.root_approval.view']);
    if (!canView) return [];

    try {
        const querySnapshot = await prisma.request.findMany({
            where: {
                action: 'kyc_request',
                status: 'pending',
            }
        });

        if (querySnapshot.length === 0) {
            return [];
        }

        const requests = await Promise.all(
            querySnapshot.map(async (doc) => {
                const accountId = doc.senderId;
                const payload = (doc.data || {}) as Record<string, any>;

                const [profile, neupIds] = await Promise.all([
                    getUserProfile(accountId),
                    getUserNeupIds(accountId)
                ]);

                return {
                    id: doc.id,
                    accountId,
                    userFullName: profile ? `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim() : 'Unknown User',
                    userNeupId: neupIds[0] || 'N/A',
                    documentType: String(payload.documentType || 'unknown'),
                    submittedAt: doc.createdAt.toLocaleDateString() || 'N/A',
                    status: doc.status as 'pending' | 'approved' | 'rejected',
                    documentPhotoUrl: String(payload.documentPhotoUrl || 'https://placehold.co/600x400'),
                    selfiePhotoUrl: String(payload.selfiePhotoUrl || 'https://placehold.co/400x400'),
                };
            })
        );
        return requests;
    } catch (error) {
        await logError('database', error, 'getPendingKycRequests');
        return [];
    }
}


/**
 * Function approveKycRequest.
 */
export async function approveKycRequest(kycId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
    /**
     * ::neup.documentation::manage-kyc-requests-approve
     * ::function approveKycRequest(kycId, accountId)
     *
     * Approves a pending KYC request and marks the account as verified.
     *
     * ::public
     *
     * Use this when a reviewer accepts the submitted KYC evidence for an account.
     *
     * ::public end
     *
     * ::private
     *
     * The request status and account verification flag are updated in one transaction, followed by activity logging and route revalidation.
     *
     * ::private end
     *
     * ::end
     */
    const canApprove = await checkPermissions(['requests.root_approval.approve']);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

    try {
        await prisma.$transaction([
            prisma.request.update({
                where: { id: kycId },
                data: { status: 'approved' }
            }),
            prisma.account.update({
                where: { id: accountId },
                data: { isVerified: true }
            })
        ]);

        await logActivity(accountId, activityAction.verificationApproved('KYC'), 'Success');
        revalidatePath('/manage/requests/kyc');
        return { success: true };
    } catch (error) {
        await logError('database', error, `approveKycRequest: ${kycId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function rejectKycRequest.
 */
export async function rejectKycRequest(kycId: string, accountId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    /**
     * ::neup.documentation::manage-kyc-requests-reject
     * ::function rejectKycRequest(kycId, accountId, reason)
     *
     * Rejects a pending KYC request.
     *
     * ::public
     *
     * Use this when the submitted KYC evidence is insufficient or invalid.
     *
     * ::public end
     *
     * ::private
     *
     * Rejection records the new request status and logs the reviewer-supplied reason in the activity stream.
     *
     * ::private end
     *
     * ::end
     */
    const canDeny = await checkPermissions(['requests.root_approval.approve']);
    if (!canDeny) return { success: false, error: 'Permission denied.' };

    try {
        await prisma.request.update({
            where: { id: kycId },
            data: { status: 'rejected' }
        });
        
        await logActivity(accountId, `KYC Rejected. Reason: ${reason}`, 'Alert');
        revalidatePath('/manage/requests/kyc');
        return { success: true };
    } catch (error) {
        await logError('database', error, `rejectKycRequest: ${kycId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
