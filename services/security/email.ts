'use server';

import { permission } from '@/logica/permission';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getPersonalAccountId } from '@/services/account/verify';
import { checkPermissions } from '@/services/user';
import { emailFormSchema } from '@/services/security/schema';
import { createNotification } from '../notifications';
import prisma from '@/core/helpers/prisma';
import { requireAnyPermission404 } from '@/services/account/permission-guards';

const CONTACT_TYPE = 'recoveryEmail';

const servicePermissions = [
    permission('security.recovery_email.view', 'for_individual', 'service'),
    permission('security.recovery_email.add', 'for_individual', 'service'),
    permission('security.recovery_email.remove', 'for_individual', 'service'),
];

/**
 * Function getRecoveryEmail.
 */
export async function getRecoveryEmail(): Promise<string | null> {
    try {
        await requireAnyPermission404(['security.recovery_email.view']);
        const canView = await checkPermissions(['security.recovery_email.view']);
        if (!canView) return null;

        const accountId = await getPersonalAccountId();
        if (!accountId) return null;

        const contact = await prisma.contact.findFirst({
            where: { accountId, contactType: CONTACT_TYPE },
        });
        if (contact) return contact.value || null;

        return null;
    } catch (error) {
        const accountId = await getPersonalAccountId();
        await logError('database', error, `getRecoveryEmail: ${accountId}`);
        return null;
    }
}


/**
 * Function addRecoveryEmail.
 */
export async function addRecoveryEmail(data: z.infer<typeof emailFormSchema>): Promise<{ success: boolean; error?: string; }> {
    const accountId = await getPersonalAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }
    
    try {
        await requireAnyPermission404(['security.recovery_email.add']);
        const canAdd = await checkPermissions(['security.recovery_email.add']);
        if (!canAdd) return { success: false, error: "Permission denied." };

        const validation = emailFormSchema.safeParse(data);
        if (!validation.success) {
            return { success: false, error: validation.error.flatten().fieldErrors.email?.[0] };
        }
        
        const { email } = validation.data;
        const existing = await prisma.contact.findFirst({
            where: { accountId, contactType: CONTACT_TYPE },
        });
        if (existing) {
            return { success: false, error: "A recovery email already exists. Please remove it first." };
        }

        await prisma.contact.create({
            data: {
                accountId,
                contactType: CONTACT_TYPE,
                value: email,
            },
        });
        await logActivity(accountId, 'Added Recovery Email', 'Success');
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: `A new recovery email (${email}) was added to your account.`,
        });
        
        revalidatePath('/manage/security/email');
        return { success: true };

    } catch (error) {
        await logError('database', error, `addRecoveryEmail: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}


/**
 * Function removeRecoveryEmail.
 */
export async function removeRecoveryEmail(): Promise<{ success: boolean; error?: string; }> {
    const accountId = await getPersonalAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }

    try {
        await requireAnyPermission404(['security.recovery_email.remove']);
        const canRemove = await checkPermissions(['security.recovery_email.remove']);
        if (!canRemove) return { success: false, error: "Permission denied." };
        
        await prisma.contact.deleteMany({
            where: { accountId, contactType: CONTACT_TYPE },
        });
        await logActivity(accountId, 'Removed Recovery Email', 'Success');
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: `Your recovery email has been removed.`,
        });

        revalidatePath('/manage/security/email');
        return { success: true };
    } catch (error) {
        await logError('database', error, `removeRecoveryEmail: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}
