'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile, getUserNeupIds, checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ACCESS_BLOCK_UPDATE_PERMISSIONS,
  ACCESS_BLOCK_VIEW_PERMISSIONS,
} from '@/core/account/access-view-permissions';

const neupIdSchema = z.object({
  neupId: z.string().min(3, 'NeupID must be at least 3 characters.'),
});

const servicePermissions = [
  permission('access.block.view.self', 'for_individual', 'service'),
  permission('access.block.update.self', 'for_individual', 'service'),
];

/**
 * Type BlockedUser.
 */
export type BlockedUser = {
  accountId: string;
  neupId: string;
  displayName: string;
  displayPhoto?: string;
};


/**
 * Type BlockJson.
 */
type BlockJson = { blockList?: string[]; restrictList?: string[] } | null;


// Helper function to find a user's account ID by their NeupID
async function findAccountIdByNeupId(neupId: string): Promise<string | null> {
  try {
    const neup = await prisma.neupId.findUnique({ where: { id: neupId } });
    return neup ? neup.accountId : null;
  } catch (error) {
    await logError('database', error, `findAccountIdByNeupId: ${neupId}`);
    return null;
  }
}


// Unified function to fetch either blocked or restricted users
async function getList(type: 'blockList' | 'restrictList'): Promise<BlockedUser[]> {
  const canView = await checkPermissions([...ACCESS_BLOCK_VIEW_PERMISSIONS]);
  if (!canView) return [];

  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    const details = (account?.details as Record<string, unknown> | null) || {};
    const block = (details.block as BlockJson) || {};
    const listAccountIds: string[] = (block?.[type] as string[]) || [];

    if (listAccountIds.length === 0) return [];

    const userPromises = listAccountIds.map(async (blockedAccountId) => {
      const [profile, neupIds] = await Promise.all([
        getUserProfile(blockedAccountId),
        getUserNeupIds(blockedAccountId),
      ]);
      return {
        accountId: blockedAccountId,
        neupId: neupIds[0] || 'N/A',
        displayName: profile?.nameDisplay || `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() || 'Unknown User',
        displayPhoto: profile?.accountPhoto,
      };
    });

    return Promise.all(userPromises);
  } catch (error) {
    await logError('database', error, `getList (${type})`);
    return [];
  }
}


/**
 * Function getBlockedUsers.
 */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  return getList('blockList');
}


/**
 * Function getRestrictedUsers.
 */
export async function getRestrictedUsers(): Promise<BlockedUser[]> {
  return getList('restrictList');
}


// Unified function to add a user to a list
async function addUserToList(neupId: string, type: 'blockList' | 'restrictList'): Promise<{ success: boolean; error?: string; }> {
  const validation = neupIdSchema.safeParse({ neupId });
  if (!validation.success) {
    return { success: false, error: validation.error.flatten().fieldErrors.neupId?.[0] || 'Invalid input' };
  }

  const canEdit = await checkPermissions([...ACCESS_BLOCK_UPDATE_PERMISSIONS]);
  if (!canEdit) return { success: false, error: 'Permission denied.' };

  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'User not authenticated.' };

  const memberId = await findAccountIdByNeupId(neupId);
  if (!memberId) return { success: false, error: 'User with that NeupID not found.' };

  if (memberId === accessTo) {
    return { success: false, error: `You cannot ${type === 'blockList' ? 'block' : 'restrict'} yourself.` };
  }

  try {
    const account = await prisma.account.findUnique({ where: { id: accessTo } });
    const details = (account?.details as Record<string, unknown> | null) || {};
    const block = (details.block as BlockJson) || {};
    const list: string[] = Array.isArray(block?.[type]) ? (block?.[type] as string[]) : [];
    if (!list.includes(memberId)) list.push(memberId);
    const newBlock: BlockJson = { ...(block || {}), [type]: list };
    await prisma.account.update({
      where: { id: accessTo },
      data: { details: { ...(details || {}), block: newBlock } as any },
    });
    revalidatePath('/access/blocked');
    return { success: true };
  } catch (error) {
    await logError('database', error, `addUserToList (${type})`);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}


/**
 * Function blockUser.
 */
export async function blockUser(neupId: string) {
  return addUserToList(neupId, 'blockList');
}


/**
 * Function restrictUser.
 */
export async function restrictUser(neupId: string) {
  return addUserToList(neupId, 'restrictList');
}


// Unified function to remove a user from a list
async function removeUserFromList(accountId: string, type: 'blockList' | 'restrictList'): Promise<{ success: boolean; error?: string; }> {
  const canEdit = await checkPermissions([...ACCESS_BLOCK_UPDATE_PERMISSIONS]);
  if (!canEdit) return { success: false, error: 'Permission denied.' };

  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'User not authenticated.' };

  try {
    const account = await prisma.account.findUnique({ where: { id: accessTo } });
    const details = (account?.details as Record<string, unknown> | null) || {};
    const block = (details.block as BlockJson) || {};
    const list: string[] = Array.isArray(block?.[type]) ? (block?.[type] as string[]) : [];
    const newList = list.filter((id) => id !== accountId);
    const newBlock: BlockJson = { ...(block || {}), [type]: newList };
    await prisma.account.update({
      where: { id: accessTo },
      data: { details: { ...(details || {}), block: newBlock } as any },
    });
    revalidatePath('/access/blocked');
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeUserFromList (${type})`);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}


/**
 * Function unblockUser.
 */
export async function unblockUser(accountId: string) {
  return removeUserFromList(accountId, 'blockList');
}


/**
 * Function unrestrictUser.
 */
export async function unrestrictUser(accountId: string) {
  return removeUserFromList(accountId, 'restrictList');
}
