 'use server';
 
 import { logError } from '@/core/helpers/logger';
 import { z } from 'zod';
 import { whatsAppFormSchema, verifyCodeSchema } from '@/app/(manage)/access/link/whatsapp/schema';
 import { revalidatePath } from 'next/cache';
 import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';
 import { ACCESS_LINKED_ACCOUNT_ADD_PERMISSIONS } from '@/core/auth/access-view-permissions';
 
 /**
  * Function sendVerificationCode.
  */
 export async function sendVerificationCode(
   data: z.infer<typeof whatsAppFormSchema>,
   managerAccountId?: string | null,
 ): Promise<{ success: boolean; error?: string }> {
   const accessContext = await resolveAccessProfileContext({
     selectedProfile: managerAccountId,
     requiredPermissions: ACCESS_LINKED_ACCOUNT_ADD_PERMISSIONS,
   });
   if (!accessContext) {
     return { success: false, error: 'You do not have permission to link accounts.' };
   }

   const accountId = accessContext.selectedProfile;
 
   const validation = whatsAppFormSchema.safeParse(data);
   if (!validation.success) {
     return { success: false, error: validation.error.flatten().fieldErrors.whatsappNumber?.[0] };
   }
 
   const { whatsappNumber } = validation.data;
 
   try {
     console.log(`Simulating sending verification code to ${whatsappNumber} for account ${accountId}`);
     return { success: true };
   } catch (error) {
     await logError('unknown', error, `sendVerificationCode: ${accountId}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }


 /**
  * Function linkWhatsAppAccount.
  */
 export async function linkWhatsAppAccount(
   data: z.infer<typeof verifyCodeSchema>,
   managerAccountId?: string | null,
 ): Promise<{ success: boolean; error?: string }> {
   const accessContext = await resolveAccessProfileContext({
     selectedProfile: managerAccountId,
     requiredPermissions: ACCESS_LINKED_ACCOUNT_ADD_PERMISSIONS,
   });
   if (!accessContext) {
     return { success: false, error: 'You do not have permission to link accounts.' };
   }

   const accountId = accessContext.selectedProfile;
 
   const validation = verifyCodeSchema.safeParse(data);
   if (!validation.success) {
     return { success: false, error: validation.error.flatten().fieldErrors.code?.[0] };
   }
 
   const { code, whatsappNumber } = validation.data;
 
   try {
     if (code === '123456') {
      console.log(`Successfully linked WhatsApp number ${whatsappNumber} to account ${accountId}`);
      revalidatePath(`/access/link/whatsapp?selectedProfile=${accountId}`);
      return { success: true };
    }
     return { success: false, error: 'The verification code is incorrect.' };
   } catch (error) {
     await logError('unknown', error, `linkWhatsAppAccount: ${accountId}`);
     return { success: false, error: 'An unexpected error occurred.' };
   }
 }
 
