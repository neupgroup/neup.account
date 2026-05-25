'use server';

import prisma from '@/core/helpers/prisma';
import { getUserProfile, checkPermissions, getUserNeupIds } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';

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
    const accountId = await getPersonalAccountId();
    if (!accountId) return [];

    try {
        const notifications = await prisma.notification.findMany({
            where: { accountId }
        });

        const invitations: Invitation[] = [];
        for (const notif of notifications) {
            const detail = notif.detail as any || {};
            const requestId = detail.requestId;
            if (!requestId) continue;

            const request = await prisma.request.findUnique({
                where: { id: requestId }
            });
            
            if (!request || request.status !== 'pending') continue;

            const senderProfile = await getUserProfile(request.senderId);
            const senderNeupIds = await prisma.neupId.findMany({
                where: { accountId: request.senderId }
            });

            invitations.push({
                notificationId: notif.id,
                requestId: request.id,
                action: request.action,
                senderId: request.senderId,
                senderName: senderProfile?.nameDisplay || `${senderProfile?.nameFirst || ''} ${senderProfile?.nameLast || ''}`.trim() || 'A user',
                senderNeupId: senderNeupIds[0]?.id || 'N/A',
                createdAt: notif.createdAt.toISOString(),
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
     const inviteeId = await getPersonalAccountId();
    if (!inviteeId) return { success: false, error: 'User not authenticated.' };

    try {
        const request = await prisma.request.findUnique({
            where: { id: requestId }
        });

        if (!request) return { success: false, error: 'Request not found.' };
        if (request.recipientId !== inviteeId) {
            return { success: false, error: 'This invitation is not for you.' };
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
                // Ensure the account.delegate role exists
                await tx.authzRole.upsert({
                    where: { id: 'account.delegate' },
                    update: { name: 'account.delegate', scope: 'account', appId: 'neup.account' },
                    create: { id: 'account.delegate', name: 'account.delegate', scope: 'account', appId: 'neup.account' },
                });
                await tx.member.create({
                    data: {
                        accessTo: request.senderId,
                        memberId: inviteeId,
                        roleId: 'account.delegate',
                        appId: 'neup.account',
                    }
                });
            }

            await tx.request.update({
                where: { id: requestId },
                data: { status: 'approved' }
            });

            await tx.notification.delete({
                where: { id: notificationId }
            });
        });

        revalidatePath('/manage/people/invitations');
        revalidatePath('/manage/notifications');
        revalidatePath('/manage/access');
        revalidatePath('/manage/people/family');
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
    const inviteeId = await getPersonalAccountId();
    if (!inviteeId) return { success: false, error: 'User not authenticated.' };

    try {
        const request = await prisma.request.findUnique({
            where: { id: requestId }
        });

        if (!request || request.recipientId !== inviteeId) {
            return { success: false, error: 'Request not found or you do not have permission to reject it.' };
        }

        await prisma.$transaction([
            prisma.request.update({
                where: { id: requestId },
                data: { status: 'rejected' }
            }),
            prisma.notification.delete({
                where: { id: notificationId }
            })
        ]);

        revalidatePath('/manage/people/invitations');
        revalidatePath('/manage/notifications');
        return { success: true };
    } catch (error) {
        await logError('database', error, `rejectRequest: ${requestId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
