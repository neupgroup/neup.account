 'use server';
 
 import { permission } from '@/logica/permission';
 import prisma from '@/neup.core/helpers/prisma';
 import { getPersonalAccountId } from '@/neup.core/auth/verify';
 import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { checkPermissions, getUserNeupIds } from '@/services/user';
import { revalidatePath } from 'next/cache';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';

const servicePermissions = [
  permission('root.account.edit_neupid', 'for_individual', 'service'),
];
 
 /**
  * Function addNeupId.
  */
 export async function addNeupId(accountId: string, neupId: string): Promise<{ success: boolean; error?: string }> {
   const canModify = await checkPermissions(['root.account.edit_neupid']);
   if (!canModify) return { success: false, error: 'Permission denied.' };
 
   const adminId = await getPersonalAccountId();
   if (!adminId) return { success: false, error: 'Administrator not authenticated.' };
 
   const lowerCaseNeupId = neupId.toLowerCase();
 
   try {
    const existing = await prisma.neupId.findUnique({
      where: { id: lowerCaseNeupId },
    });
    if (existing) {
       return { success: false, error: 'This NeupID is already taken.' };
     }
 
    await prisma.neupId.create({
      data: {
        id: lowerCaseNeupId,
        neupId: lowerCaseNeupId,
        accountId,
        isPrimary: false,
      },
    });
 
     await logActivity(accountId, `NeupID added by admin: ${lowerCaseNeupId}`, 'Success', undefined, adminId);
     revalidatePath(`/manage/${accountId}/profile/neupid`);
     return { success: true };
   } catch (e) {
     await logError('database', e, `addNeupId for account ${accountId}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }


 /**
  * Function removeNeupId.
  */
 export async function removeNeupId(neupId: string): Promise<{ success: boolean; error?: string }> {
   const canModify = await checkPermissions(['root.account.edit_neupid']);
   if (!canModify) return { success: false, error: 'Permission denied.' };
 
   const adminId = await getPersonalAccountId();
   if (!adminId) return { success: false, error: 'Administrator not authenticated.' };
 
   try {
    const neupidDoc = await prisma.neupId.findUnique({
      where: { id: neupId },
    });
    if (!neupidDoc) {
       return { success: false, error: 'NeupID not found.' };
     }
 
    if (neupidDoc.isPrimary) {
       return { success: false, error: 'Cannot remove a primary NeupID. Set another as primary first.' };
     }
 
    const accountId = neupidDoc.accountId;
    await prisma.neupId.delete({
      where: { id: neupId },
    });
 
     await logActivity(accountId, `NeupID removed by admin: ${neupId}`, 'Success', undefined, adminId);
     revalidatePath(`/manage/${accountId}/profile/neupid`);
     return { success: true };
   } catch (e) {
     await logError('database', e, `removeNeupId: ${neupId}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }


 /**
  * Function setPrimaryNeupId.
  */
 export async function setPrimaryNeupId(accountId: string, newPrimaryNeupId: string): Promise<{ success: boolean; error?: string }> {
   const canModify = await checkPermissions(['root.account.edit_neupid']);
   if (!canModify) return { success: false, error: 'Permission denied.' };
 
   const adminId = await getPersonalAccountId();
   if (!adminId) return { success: false, error: 'Administrator not authenticated.' };
 
   try {
     const existingNeupIds = await getUserNeupIds(accountId);
     if (!existingNeupIds.includes(newPrimaryNeupId)) {
       return { success: false, error: 'This NeupID does not belong to the user.' };
     }
 
    await prisma.neupId.updateMany({
      where: { accountId },
      data: { isPrimary: false },
    });
    await prisma.neupId.update({
      where: { id: newPrimaryNeupId },
      data: { isPrimary: true },
    });

    const dispatchResult = await dispatchAccountUpdatedEvent({
      accountId,
      changedFields: ['neupId'],
    });
    if (dispatchResult.sent > 0 && dispatchResult.succeeded === 0) {
      await logError('webhook', new Error('No downstream app returned success for account update event.'), `dispatchAccountUpdatedEvent:${accountId}:setPrimaryNeupId`);
    }
 
     await logActivity(accountId, `Primary NeupID set to: ${newPrimaryNeupId}`, 'Success', undefined, adminId);
     revalidatePath(`/manage/${accountId}/profile/neupid`);
     return { success: true };
   } catch (e) {
     await logError('database', e, `setPrimaryNeupId for account ${accountId}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }
 
