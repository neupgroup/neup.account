// @ts-nocheck
'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { getUserProfile, checkPermissions, getUserNeupIds } from '@/services/user';
import { getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { ensureAccessMember } from '@/services/access-model';
import {
  ACCESS_INVITATION_APPROVE_PERMISSIONS,
  ACCESS_INVITATIONS_VIEW_PERMISSIONS,
} from '@/core/auth/access-view-permissions';

const servicePermissions = [
    permission('access.invitations.view.self', 'for_individual', 'service'),
    permission('access.invitation.approve.self', 'for_individual', 'service'),
];

export type Invitation = {
    notificationId: string;
    requestId: string;
    action: string;
    senderId: string;
    senderName: string;
    senderNeupId: string;
    createdAt: string;
};

/**
 * Function getInvitations.
 */
export async function getInvitations(): Promise<Invitation[]> {
    const canView = await checkPermissions([...ACCESS_INVITATIONS_VIEW_PERMISSIONS]);
    if (!canView) return [];

    const accountId = await getActiveAccountId();
    if (!accountId) return [];

    try {
        const invitations: Invitation[] = [];
        const pendingRequests = await prisma.request.findMany({
            where: {
                recipientId: accountId,
                status: 'pending',
                action: {
                    in: ['family_invitation', 'access_invitation'],
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const notifications = await prisma.notification.findMany({
            where: { accountId }
        });
        const notificationByRequestId = new Map<string, (typeof notifications)[number]>();
        for (const notif of notifications) {
            const detail = (notif.detail as { requestId?: string } | null) || {};
            if (detail.requestId && pendingRequests.some((request) => request.id === detail.requestId)) {
                notificationByRequestId.set(detail.requestId, notif);
            }
        }

        for (const request of pendingRequests) {
            const notif = notificationByRequestId.get(request.id);
            const senderProfile = await getUserProfile(request.senderId);
            const senderNeupIds = await prisma.neupId.findMany({
                where: { accountId: request.senderId }
            });

            invitations.push({
                notificationId: notif?.id ?? request.id,
                requestId: request.id,
                action: request.action,
                senderId: request.senderId,
                senderName: senderProfile?.nameDisplay || `${senderProfile?.nameFirst || ''} ${senderProfile?.nameLast || ''}`.trim() || 'A user',
                senderNeupId: senderNeupIds[0]?.id || 'N/A',
                createdAt: (notif?.createdAt ?? request.createdAt).toISOString(),
            });
        }

        invitations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return invitations;
    } catch (error) {
        await logError('database', error, 'getInvitations');
        return [];
    }
}


/**
 * Function acceptRequest.
 */
export async function acceptRequest(requestId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
     const canApprove = await checkPermissions([...ACCESS_INVITATION_APPROVE_PERMISSIONS]);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

     const inviteeId = await getActiveAccountId();
    if (!inviteeId) return { success: false, error: 'User not authenticated.' };

    try {
        const request = await prisma.request.findUnique({
            where: { id: requestId }
        });

        if (!request) return { success: false, error: 'Request not found.' };
        if (request.recipientId !== inviteeId) {
            return { success: false, error: 'This invitation is not for you.' };
        }
        if (request.status !== 'pending') {
            return { success: false, error: 'This invitation has already been processed.' };
        }
        const requestData = request.data as Record<string, unknown> | null;
        if (typeof requestData?.expiresOn === 'string') {
            const expiresOn = new Date(requestData.expiresOn);
            if (!Number.isNaN(expiresOn.getTime()) && expiresOn <= new Date()) {
                return { success: false, error: 'This invitation has expired.' };
            }
        }

        await prisma.$transaction(async (tx) => {
            if (request.action === 'family_invitation') {
                const inviterId = request.senderId;

                // Find family by checking if inviter is in a family
                let family = await tx.family.findFirst({
                    where: {
                        members: { some: { memberId: inviterId } }
                    }
                });

                if (!family) {
                    // Create new family if it doesn't exist
                    family = await tx.family.create({
                        data: {
                            createdBy: inviterId,
                            members: {
                                create: [
                                    { memberId: inviterId, role: 'member' },
                                    { memberId: inviteeId, role: 'member' }
                                ]
                            }
                        }
                    });
                } else {
                    // Check if invitee is already in family
                    const existingMember = await tx.familyMember.findFirst({
                        where: { familyId: family.id, memberId: inviteeId }
                    });

                    if (!existingMember) {
                        // Add invitee to family
                        await tx.familyMember.create({
                            data: { familyId: family.id, memberId: inviteeId, role: 'member' }
                        });
                    }
                }

            } else if (request.action === 'access_invitation') {
                const data = request.data as Record<string, unknown> | null;
                const parentPortfolioId =
                    typeof data?.parentPortfolioId === 'string' ? data.parentPortfolioId : null;

                if (parentPortfolioId) {
                    const invitedMember = await tx.member.findFirst({
                        where: {
                            parentPortfolioId,
                            memberAccountId: inviteeId,
                            status: 'invited',
                        },
                        select: { id: true, details: true },
                    });
                    if (!invitedMember) {
                        throw new Error('Portfolio invitation membership was not found.');
                    }
                    const details = invitedMember.details as Record<string, unknown> | null;
                    await tx.member.update({
                        where: { id: invitedMember.id },
                        data: {
                            status: 'active',
                            isTemporary: null,
                            details: {
                                ...(details ?? {}),
                                isPermanent: false,
                                hasFullAccess: false,
                                acceptedAt: new Date().toISOString(),
                                expiresOn: null,
                            },
                        },
                    });
                } else {
                    await ensureAccessMember(tx, {
                        childAccountId: inviteeId,
                        parentAccountId: request.senderId,
                        status: 'active',
                    });
                }
            }

            await tx.request.update({
                where: { id: requestId },
                data: { status: 'approved' }
            });

            await tx.notification.deleteMany({
                where: {
                    OR: [
                        { id: notificationId },
                        {
                            detail: {
                                path: ['requestId'],
                                equals: requestId,
                            },
                        },
                    ],
                },
            });
        });

        revalidatePath('/access/invitations');
        revalidatePath('/manage/notifications');
        revalidatePath('/manage/access');
        revalidatePath('/access/team');
        revalidatePath('/access/family');
        return { success: true };
    } catch (error) {
        await logError('database', error, `acceptRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function rejectRequest.
 */
export async function rejectRequest(requestId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
    const canApprove = await checkPermissions([...ACCESS_INVITATION_APPROVE_PERMISSIONS]);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

    const inviteeId = await getActiveAccountId();
    if (!inviteeId) return { success: false, error: 'User not authenticated.' };

    try {
        const request = await prisma.request.findUnique({
            where: { id: requestId }
        });

        if (!request || request.recipientId !== inviteeId) {
            return { success: false, error: 'Request not found or you do not have permission to reject it.' };
        }

        await prisma.$transaction(async (tx) => {
            const data = request.data as Record<string, unknown> | null;
            const parentPortfolioId =
                typeof data?.parentPortfolioId === 'string' ? data.parentPortfolioId : null;

            if (request.action === 'access_invitation' && parentPortfolioId) {
                await tx.member.deleteMany({
                    where: {
                        parentPortfolioId,
                        memberAccountId: inviteeId,
                        status: 'invited',
                    },
                });
            }

            await tx.request.update({
                where: { id: requestId },
                data: { status: 'rejected' }
            });
            await tx.notification.deleteMany({
                where: {
                    OR: [
                        { id: notificationId },
                        {
                            detail: {
                                path: ['requestId'],
                                equals: requestId,
                            },
                        },
                    ],
                },
            });
        });

        revalidatePath('/access/invitations');
        revalidatePath('/manage/notifications');
        return { success: true };
    } catch (error) {
        await logError('database', error, `rejectRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
