'use server';

import prisma from '@/core/helpers/prisma';
import { getUserProfile, checkPermissions, getUserNeupIds } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { activityAction } from '@/services/activity-action';

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
