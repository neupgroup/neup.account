'use server';

import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { getUserProfile, checkPermissions } from '@/services/user';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type FamilyMember = {
  accountId: string;
  neupId: string;
  displayName: string;
  displayPhoto?: string;
  status: 'pending' | 'approved';
  hidden: boolean;
  addedBy: string;
};

export type FamilyGroup = {
  id: string;
  createdBy: string;
  members: FamilyMember[];
};

const addAccountSchema = z.object({
  neupId: z
    .string()
    .min(3, 'NeupID must be at least 3 characters.')
    .max(30, 'NeupID cannot be more than 30 characters.'),
});

// --- NEW INVITATION-BASED LOGIC ---
async function createInvite(
  neupId: string,
  type: 'member' | 'partner'
): Promise<{ success: boolean; error?: string }> {
  const inviterAccountId = await getPersonalAccountId();
  if (!inviterAccountId) return { success: false, error: 'User not authenticated.' };

  try {
    const neupIdRecord = await prisma.neupId.findUnique({
      where: { id: neupId }
    });

    if (!neupIdRecord)
      return { success: false, error: 'No user found with that NeupID.' };

    const inviteeAccountId = neupIdRecord.accountId;
    if (inviteeAccountId === inviterAccountId)
      return { success: false, error: 'You cannot invite yourself.' };
      
    // Check if user is already in a family with the inviter.
    const family = await prisma.family.findFirst({
      where: {
        members: {
          some: { memberId: inviterAccountId }
        }
      },
      include: {
        members: true
      }
    });

    if (family && family.members.some(m => m.memberId === inviteeAccountId)) {
        return { success: false, error: 'This user is already in your family.' };
    }

    const existingRequest = await prisma.request.findFirst({
      where: {
        action: 'family_invitation',
        senderId: inviterAccountId,
        recipientId: inviteeAccountId,
        status: 'pending'
      }
    });

    if(existingRequest) {
        return { success: false, error: 'An invitation has already been sent to this user.' };
    }

    await prisma.$transaction(async (tx) => {
      const newRequest = await tx.request.create({
        data: {
          action: 'family_invitation',
          senderId: inviterAccountId,
          recipientId: inviteeAccountId,
          type: type,
          status: 'pending',
        }
      });
      
      await tx.notification.create({
        data: {
          accountId: inviteeAccountId,
          type: 'info',
          title: 'Family Invitation',
          message: `You have received a family invitation.`,
          read: false,
          detail: { requestId: newRequest.id }
        }
      });
    });

    revalidatePath('/access/family');
    return { success: true };
  } catch (error) {
    await logError('database', error, `createInvite:${type}`);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}


/**
 * Function addFamilyMember.
 */
export async function addFamilyMember(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const canAdd = await checkPermissions(['people.family.add']);
  if (!canAdd) return { success: false, error: 'Permission denied.' };

  const validation = addAccountSchema.safeParse({
    neupId: formData.get('neupId'),
  });
  if (!validation.success)
    return {
      success: false,
      error: validation.error.flatten().fieldErrors.neupId?.[0],
    };
  return createInvite(validation.data.neupId, 'member');
}


/**
 * Function addPartner.
 */
export async function addPartner(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const canAdd = await checkPermissions(['people.family.partner.add']);
  if (!canAdd) return { success: false, error: 'Permission denied.' };

  const validation = addAccountSchema.safeParse({
    neupId: formData.get('neupId'),
  });
  if (!validation.success)
    return {
      success: false,
      error: validation.error.flatten().fieldErrors.neupId?.[0],
    };
  return createInvite(validation.data.neupId, 'partner');
}


// --- DATA FETCHING FOR DISPLAY ---
async function fetchFamilyGroups(): Promise<FamilyGroup[]> {
  const canView = await checkPermissions(['people.family.view']);
  if (!canView) return [];
  
  const accountId = await getPersonalAccountId();
  if (!accountId) return [];

  try {
    const families = await prisma.family.findMany({
      where: {
        members: {
          some: { memberId: accountId }
        }
      },
      include: {
        members: true
      }
    });

    if (families.length === 0) return [];

    const populatedFamilies = await Promise.all(
      families.map(async (family) => {
        const members = (family.members as any[]) || [];
        const populatedMembers: FamilyMember[] = await Promise.all(
          members.map(async (member: any) => {
            const profile = await getUserProfile(member.memberId);
            const neupIdRecord = await prisma.neupId.findFirst({
              where: {
                accountId: member.memberId,
                isPrimary: true
              }
            });

            return {
              accountId: member.memberId,
              neupId: neupIdRecord?.id || 'N/A',
              displayName:
                profile?.nameDisplay ||
                `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() ||
                'Unknown User',
              displayPhoto: profile?.accountPhoto,
              status: 'approved',
              hidden: false,
              addedBy: family.createdBy,
            };
          })
        );

        return {
          id: family.id,
          createdBy: family.createdBy,
          members: populatedMembers,
        };
      })
    );

    return populatedFamilies;
  } catch (e) {
    await logError('database', e, 'fetchFamilyGroups');
    return [];
  }
}


/**
 * Function getFamilyGroups.
 */
export async function getFamilyGroups(): Promise<FamilyGroup[]> {
  return fetchFamilyGroups();
}


/**
 * Function removeFamilyMember.
 */
export async function removeFamilyMember(
  familyId: string,
  memberAccountId: string
): Promise<{ success: boolean; error?: string }> {
  const removerId = await getPersonalAccountId();
  if (!removerId) return { success: false, error: 'User not authenticated.' };

  const canRemoveFamily = await checkPermissions(['people.family.remove']);
  const canRemovePartner = await checkPermissions(['people.family.partner.remove']);

  try {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: { members: true }
    });

    if (!family) return { success: false, error: 'Family not found.' };

    const memberToRemove = family.members.find(m => m.memberId === memberAccountId);
    if (!memberToRemove) return { success: false, error: "Member not found in family." };

    // Additional business logic: Only the creator of the family or the member themselves can remove someone.
    if (removerId !== family.createdBy && removerId !== memberAccountId) {
      return {
        success: false,
        error: "You don't have permission to remove this member.",
      };
    }

    // Delete the family member relationship
    await prisma.familyMember.delete({
      where: { id: memberToRemove.id }
    });

    revalidatePath('/access/family');
    return { success: true };
  } catch (e) {
    await logError('database', e, 'removeFamilyMember');
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
