'use server';

import { permission } from '@/neup.logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { Prisma } from '@/prisma/generated/client';
import { getUserProfile, getUserNeupIds, checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';

const servicePermissions = [
    permission('requests.root_approval.view', 'for_individual', 'service'),
    permission('requests.root_approval.approve', 'for_individual', 'service'),
];

export type PendingNeupIdRequest = {
    id: string;
    userFullName: string;
    requestedNeupId: string;
    requestDate: string;
    status: string;
    currentNeupIds: string[];
    accountId: string;
};

// Internal type to include raw date for sorting
type PendingRequestInternal = PendingNeupIdRequest & {
    createdAt: Date;
};


/**
 * Function getPendingNeupIdRequests.
 */
export async function getPendingNeupIdRequests(): Promise<PendingNeupIdRequest[]> {
    const canView = await checkPermissions(['requests.root_approval.view']);
    if (!canView) return [];

    try {
        const requests = await prisma.request.findMany({
            where: {
                action: 'neupid_request',
                status: 'pending',
            },
        });

        if (requests.length === 0) {
            return [];
        }

        const pendingRequests = await Promise.all(
            requests.map(async (doc) => {
                const accountId = doc.senderId;
                const payload = (doc.data || {}) as Record<string, any>;

                const [profile, currentNeupIds] = await Promise.all([
                    getUserProfile(accountId),
                    getUserNeupIds(accountId)
                ]);

                const userFullName = profile ? `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim() : 'Unknown User';
                
                const createdAt = doc.createdAt;

                return {
                    id: doc.id,
                    userFullName,
                    requestedNeupId: String(payload.requestedNeupId || payload.requestedId || ''),
                    requestDate: createdAt.toLocaleDateString(),
                    status: doc.status,
                    currentNeupIds: currentNeupIds,
                    accountId: accountId,
                    createdAt: createdAt
                };
            })
        );
        const validRequests = pendingRequests.filter((request): request is PendingRequestInternal => request !== null);
        validRequests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return validRequests.map(({ createdAt, ...rest }) => rest);

    } catch (error) {
        await logError('database', error, 'getPendingNeupIdRequests');
        return [];
    }
}


/**
 * Function getNeupIdRequestDetails.
 */
export async function getNeupIdRequestDetails(id: string): Promise<PendingNeupIdRequest | null> {
    const canView = await checkPermissions(['requests.root_approval.view']);
    if (!canView) return null;

    try {
        const request = await prisma.request.findUnique({ where: { id } });

        if (!request) {
            return null;
        }

        const accountId = request.senderId;
        const payload = (request.data || {}) as Record<string, any>;

        const [profile, currentNeupIds] = await Promise.all([
            getUserProfile(accountId),
            getUserNeupIds(accountId)
        ]);

        const userFullName = profile ? `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim() : 'Unknown User';
        const createdAt = request.createdAt;

        return {
            id: request.id,
            userFullName,
            requestedNeupId: String(payload.requestedNeupId || payload.requestedId || ''),
            requestDate: createdAt.toLocaleDateString(),
            status: request.status,
            currentNeupIds: currentNeupIds,
            accountId: accountId,
        };
    } catch (error) {
        await logError('database', error, `getNeupIdRequestDetails: ${id}`);
        return null;
    }
}


/**
 * Function approveNeupIdRequest.
 */
export async function approveNeupIdRequest(requestId: string, accountId: string, newNeupId: string): Promise<{success: boolean, error?: string}> {
    const canApprove = await checkPermissions(['requests.root_approval.approve']);
    if (!canApprove) {
        return { success: false, error: 'Permission denied.' };
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.request.update({
                where: { id: requestId },
                data: { status: 'approved' }
            });
            await tx.neupId.create({
                data: {
                    id: newNeupId.toLowerCase(),
                    neupId: newNeupId.toLowerCase(),
                    accountId: accountId,
                    isPrimary: false,
                }
            });
            const account = await tx.account.findUnique({
                where: { id: accountId },
                select: { details: true },
            });
            const details =
                account?.details && typeof account.details === 'object'
                    ? { ...(account.details as Record<string, unknown>) }
                    : {};
            const pendingRequests =
                details.pendingRequests && typeof details.pendingRequests === 'object'
                    ? { ...(details.pendingRequests as Record<string, unknown>) }
                    : {};
            delete pendingRequests.neupid;
            details.pendingRequests = pendingRequests;
            await tx.account.update({
                where: { id: accountId },
                data: { details: details as Prisma.InputJsonValue },
            });
        });

        await logActivity(accountId, `Approved NeupID Request: ${newNeupId}`, 'Success');

        return { success: true };
    } catch (error) {
        await logError('database', error, `approveNeupIdRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function denyNeupIdRequest.
 */
export async function denyNeupIdRequest(requestId: string): Promise<{success: boolean, error?: string}> {
    const canDeny = await checkPermissions(['requests.root_approval.approve']);
    if (!canDeny) {
        return { success: false, error: 'Permission denied.' };
    }
    
    try {
        const request = await prisma.request.findUnique({ where: { id: requestId } });
        if (!request) return { success: false, error: 'Request not found.' };

        await prisma.$transaction(async (tx) => {
            await tx.request.update({
                where: { id: requestId },
                data: { status: 'denied' }
            });
            const account = await tx.account.findUnique({
                where: { id: request.senderId },
                select: { details: true },
            });
            const details =
                account?.details && typeof account.details === 'object'
                    ? { ...(account.details as Record<string, unknown>) }
                    : {};
            const pendingRequests =
                details.pendingRequests && typeof details.pendingRequests === 'object'
                    ? { ...(details.pendingRequests as Record<string, unknown>) }
                    : {};
            delete pendingRequests.neupid;
            details.pendingRequests = pendingRequests;
            await tx.account.update({
                where: { id: request.senderId },
                data: { details: details as Prisma.InputJsonValue },
            });
        });
        const payload = (request.data || {}) as Record<string, any>;
        
        if (request.senderId) {
            await logActivity(request.senderId, `Denied NeupID Request: ${String(payload.requestedNeupId || payload.requestedId || requestId)}`, 'Success');
        }

        return { success: true };
    } catch (error) {
        await logError('database', error, `denyNeupIdRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
