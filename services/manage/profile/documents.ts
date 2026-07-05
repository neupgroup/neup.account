
'use server';

import { permission } from '@/logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { activityAction } from '@/services/activity-action';

const servicePermissions = [
    permission('profile.kyc.update', 'for_individual', 'service'),
];

/**
 * Type KycSubmissionData.
 */
export type KycSubmissionData = {
    documentType: 'passport' | 'license' | 'national_id';
    documentId: string;
    documentPhotoUrl: string;
    documentPhotoContentId: string;
    selfiePhotoUrl: string;
    selfiePhotoContentId: string;
};


/**
 * Function submitKyc.
 */
export async function submitKyc(accountId: string, data: KycSubmissionData): Promise<{ success: boolean; error?: string }> {
    const canSubmit = await checkPermissions(['profile.kyc.update']);
    if (!canSubmit) {
        return { success: false, error: 'Permission denied.' };
    }

    try {
        // Prevent duplicate pending submissions
        const existing = await prisma.request.findFirst({
            where: {
                senderId: accountId,
                recipientId: accountId,
                action: 'kyc_request',
                status: 'pending',
            }
        });

        if (existing) {
            return { success: false, error: 'You already have a pending KYC submission.' };
        }

        await prisma.request.create({
            data: {
                senderId: accountId,
                recipientId: accountId,
                action: 'kyc_request',
                type: 'kyc',
                status: 'pending',
                data: {
                    documentType: data.documentType,
                    documentId: data.documentId,
                    documentPhotoUrl: data.documentPhotoUrl,
                    documentPhotoContentId: data.documentPhotoContentId,
                    selfiePhotoUrl: data.selfiePhotoUrl,
                    selfiePhotoContentId: data.selfiePhotoContentId,
                },
            },
        });

        await logActivity(accountId, activityAction.verificationApplied(), 'Pending');
        revalidatePath('/manage/profile/documents');

        return { success: true };
    } catch (error) {
        await logError('database', error, `submitKyc: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
