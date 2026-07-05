'use server';

import { permission } from '@/logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { getUserProfile, checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { getPersonalAccountId } from '@/neup.core/auth/verify';

const servicePermissions = [
  permission('requests.root_approval.view', 'for_individual', 'service'),
  permission('requests.root_approval.approve', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-display-name-requests-module
 * ::title Display Name Request Service
 *
 * Loads and processes root approval requests for custom display-name changes.
 *
 * ::public
 *
 * Use this service to list pending display-name requests and approve or reject them from the manage requests UI.
 *
 * ::public end
 *
 * ::private
 *
 * Approval writes update both the request status and the target account display name within one transaction.
 *
 * ::private end
 *
 * ::end
 */

/**
 * Type DisplayNameRequest.
 */
export type DisplayNameRequest = {
  id: string;
  accountId: string;
  userFullName: string;
  requestedDisplayName: string;
  createdAt: string;
};


/**
 * Function getDisplayNameRequests.
 */
export async function getDisplayNameRequests(): Promise<DisplayNameRequest[]> {
    /**
     * ::neup.documentation::manage-display-name-requests-get
     * ::function getDisplayNameRequests()
     *
     * Returns the pending custom display-name requests awaiting root review.
     *
     * ::public
     *
     * Each result includes the requester account, their current display label, the requested display name, and the request timestamp.
     *
     * ::public end
     *
     * ::private
     *
     * Request data is shaped from `request` rows plus profile lookups for the sender account.
     *
     * ::private end
     *
     * ::end
     */
    const canView = await checkPermissions(['requests.root_approval.view']);
    if (!canView) return [];

    try {
        const requests = await prisma.request.findMany({
            where: {
                action: 'display_name_request',
                status: 'pending'
            },
            orderBy: { createdAt: 'desc' }
        });

        if (requests.length === 0) {
            return [];
        }

        const formattedRequests = await Promise.all(
            requests.map(async (doc) => {
                const accountId = doc.senderId; // Assuming senderId is the one requesting
                const profile = await getUserProfile(accountId);
                const data = doc.data as any;

                return {
                    id: doc.id,
                    accountId,
                    userFullName: profile?.nameDisplay || `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() || 'Unknown',
                    requestedDisplayName: data?.requestedDisplayName || 'N/A',
                    createdAt: doc.createdAt.toLocaleString(),
                };
            })
        );
        return formattedRequests;
    } catch (error) {
        await logError('database', error, 'getDisplayNameRequests');
        return [];
    }
}


/**
 * Function processDisplayNameRequest.
 */
export async function processDisplayNameRequest(requestId: string, accountId: string, displayName: string, approve: boolean) {
    /**
     * ::neup.documentation::manage-display-name-requests-process
     * ::function processDisplayNameRequest(requestId, accountId, displayName, approve)
     *
     * Approves or rejects a pending display-name request.
     *
     * ::public
     *
     * Approval updates the account display name; rejection leaves the account unchanged and records the failed activity outcome.
     *
     * ::public end
     *
     * ::private
     *
     * The request status update and any account update are committed in one transaction and followed by a route revalidation.
     *
     * ::private end
     *
     * ::end
     */
    const canApprove = await checkPermissions(['requests.root_approval.approve']);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) {
        return { success: false, error: "Administrator not authenticated."};
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Update request status
            await tx.request.update({
                where: { id: requestId },
                data: { status: approve ? 'approved' : 'rejected' }
            });

            if (approve) {
                // Update user's account document
                await tx.account.update({
                    where: { id: accountId },
                    data: { displayName }
                });
                await logActivity(accountId, `Display name change approved: ${displayName}`, "Success", undefined, adminId);
            } else {
                await logActivity(accountId, `Display name change rejected: ${displayName}`, "Failed", undefined, adminId);
            }
        });

        revalidatePath('/manage/requests/display-name');
        return { success: true };
    } catch (error) {
        await logError('database', error, `processDisplayNameRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
