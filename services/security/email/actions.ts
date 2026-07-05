'use server';

import { permission } from '@/neup.logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { getPersonalAccountId } from '@/neup.core/auth/verify';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { emailFormSchema } from '@/services/security/schema';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { checkPermissions } from '@/services/user';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';

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
    await requireAnyPermission404(['security.recovery_email.view']);
    const canView = await checkPermissions(['security.recovery_email.view']);
    if (!canView) return null;

    const accountId = await getPersonalAccountId();
    if (!accountId) return null;

    try {
        const contact = await prisma.contact.findFirst({
            where: {
                accountId,
                contactType: CONTACT_TYPE
            }
        });
        
        return contact ? contact.value : null;
    } catch (error) {
        await logError('database', error, `getRecoveryEmail: ${accountId}`);
        return null;
    }
}


/**
 * Function addRecoveryEmail.
 */
export async function addRecoveryEmail(data: z.infer<typeof emailFormSchema>): Promise<{ success: boolean; error?: string; }> {
    await requireAnyPermission404(['security.recovery_email.add']);
    const canAdd = await checkPermissions(['security.recovery_email.add']);
    if (!canAdd) return { success: false, error: "Permission denied." };

    const accountId = await getPersonalAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }

    const validation = emailFormSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.email?.[0] };
    }
    
    const { email } = validation.data;

    try {
        const currentContact = await prisma.contact.findFirst({
            where: {
                accountId,
                contactType: CONTACT_TYPE
            }
        });

        if (currentContact) {
            return { success: false, error: "A recovery email already exists. Please remove it first." };
        }

        await prisma.contact.create({
            data: {
                accountId,
                contactType: CONTACT_TYPE,
                value: email,
            }
        });

        await logActivity(accountId, 'Added Recovery Email', 'Success');
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
    await requireAnyPermission404(['security.recovery_email.remove']);
    const canRemove = await checkPermissions(['security.recovery_email.remove']);
    if (!canRemove) return { success: false, error: "Permission denied." };
    
    const accountId = await getPersonalAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }

    try {
        await prisma.contact.deleteMany({
            where: {
                accountId,
                contactType: CONTACT_TYPE
            }
        });

        await logActivity(accountId, 'Removed Recovery Email', 'Success');
        revalidatePath('/manage/security/email');
        return { success: true };
    } catch (error) {
        await logError('database', error, `removeRecoveryEmail: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}
