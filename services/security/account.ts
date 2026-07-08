 'use server';
 
 import { permission } from '@/neup.logica/permission';
 import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { getUserProfile, checkPermissions } from '@/services/user';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
 
 /**
  * Type RecoveryAccount.
  */
 export type RecoveryAccount = {
   id: string;
   recoveryAccountId: string;
   recoveryNeupId: string;
   displayName: string;
   displayPhoto?: string;
  status: 'pending' | 'approved' | 'rejected';
 };
 
 const addAccountSchema = z.object({
   neupId: z.string().min(3, 'NeupID must be at least 3 characters.').max(16, 'NeupID cannot be more than 16 characters.'),
 });
 
const RECOVERY_CONTACT_TYPE = 'recoveryAccount';

const servicePermissions = [
  permission('security.recovery_accounts.view', 'for_individual', 'service'),
  permission('security.recovery_accounts.add', 'for_individual', 'service'),
  permission('security.recovery_accounts.remove', 'for_individual', 'service'),
];

const statusOrder: Record<RecoveryAccount['status'], number> = {
   approved: 1,
   pending: 2,
   rejected: 3,
 };


 /**
  * Function getRecoveryAccounts.
  */
export async function getRecoveryAccounts(): Promise<RecoveryAccount[]> {
   await requireAnyPermission404(['security.recovery_accounts.view']);
   const canView = await checkPermissions(['security.recovery_accounts.view']);
   if (!canView) return [];
 
   const accessTo = await getPersonalAccountId();
   if (!accessTo) return [];
 
   try {
    const rows = await prisma.contact.findMany({
      where: {
        accountId: accessTo,
        contactType: RECOVERY_CONTACT_TYPE,
      },
    });
 
    if (rows.length === 0) return [];
 
    const recoveryContacts = await Promise.all(
      rows.map(async (r) => {
        const recoveryAccountId = r.value;
        const profile = await getUserProfile(recoveryAccountId);
        const neup = await prisma.neupId.findFirst({
          where: { accountId: recoveryAccountId },
          select: { id: true },
        });

        return {
          id: r.id,
          recoveryAccountId,
          recoveryNeupId: neup?.id || 'N/A',
          displayName:
            profile?.nameDisplay ||
            `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() ||
            (neup?.id || recoveryAccountId),
          displayPhoto: profile?.accountPhoto,
          status: 'approved' as const,
        };
      }),
    );
 
     recoveryContacts.sort((a: RecoveryAccount, b: RecoveryAccount) => statusOrder[a.status] - statusOrder[b.status]);
 
     return recoveryContacts;
   } catch (error) {
     await logError('database', error, 'getRecoveryAccounts');
     return [];
   }
 }


 /**
  * Function addRecoveryAccount.
  */
export async function addRecoveryAccount(formData: FormData): Promise<{ success: boolean; error?: string; newAccount?: RecoveryAccount }> {
   await requireAnyPermission404(['security.recovery_accounts.add']);
   const canAdd = await checkPermissions(['security.recovery_accounts.add']);
   if (!canAdd) return { success: false, error: 'Permission denied.' };
 
   const accessTo = await getPersonalAccountId();
   if (!accessTo) return { success: false, error: 'User not authenticated.' };
 
   const validation = addAccountSchema.safeParse({ neupId: formData.get('neupId') });
   if (!validation.success) {
     return { success: false, error: validation.error.flatten().fieldErrors.neupId?.[0] };
   }
 
   const { neupId } = validation.data;
 
   try {
    const count = await prisma.contact.count({
      where: {
        accountId: accessTo,
        contactType: RECOVERY_CONTACT_TYPE,
      },
    });
    if (count >= 5) {
       return { success: false, error: 'You cannot add more than 5 recovery accounts.' };
     }
 
    const neup = await prisma.neupId.findUnique({ where: { id: neupId } });
 
    if (!neup) {
       return { success: false, error: 'No user found with that NeupID.' };
     }
    const recoveryAccountId = neup.accountId;
 
     if (recoveryAccountId === accessTo) {
       return { success: false, error: 'You cannot add yourself as a recovery account.' };
     }
 
    const exists = await prisma.contact.findFirst({
      where: {
        accountId: accessTo,
        contactType: RECOVERY_CONTACT_TYPE,
        value: recoveryAccountId,
      },
    });
    if (exists) {
       return { success: false, error: 'This account has already been added.' };
     }
 
    const created = await prisma.contact.create({
      data: {
        accountId: accessTo,
        contactType: RECOVERY_CONTACT_TYPE,
        value: recoveryAccountId,
      },
    });
 
     const profile = await getUserProfile(recoveryAccountId);
 
     const newAccountData: RecoveryAccount = {
      id: created.id,
       recoveryAccountId,
       recoveryNeupId: neupId,
       displayName:
         profile?.nameDisplay ||
         `${profile?.nameFirst || ''} ${profile?.nameLast || ''}`.trim() ||
         neupId,
       displayPhoto: profile?.accountPhoto,
       status: 'approved',
     };
 
     revalidatePath('/manage/security/account');
     return { success: true, newAccount: newAccountData };
   } catch (error) {
     await logError('database', error, 'addRecoveryAccount');
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }


 /**
  * Function removeRecoveryAccount.
  */
export async function removeRecoveryAccount(id: string): Promise<{ success: boolean; error?: string }> {
   await requireAnyPermission404(['security.recovery_accounts.remove']);
   const canRemove = await checkPermissions(['security.recovery_accounts.remove']);
   if (!canRemove) return { success: false, error: 'Permission denied.' };
 
   const accessTo = await getPersonalAccountId();
   if (!accessTo) return { success: false, error: 'User not authenticated.' };
 
   try {
    const row = await prisma.contact.findUnique({ where: { id } });
 
    if (!row || row.accountId !== accessTo || row.contactType !== RECOVERY_CONTACT_TYPE) {
       return { success: false, error: 'Permission denied or account not found.' };
     }
 
    await prisma.contact.delete({ where: { id } });
 
     revalidatePath('/manage/security/account');
     return { success: true };
   } catch (error) {
     await logError('database', error, `removeRecoveryAccount: ${id}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }
 
