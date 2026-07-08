'use server';

import { z } from 'zod';
import { validateNeupId } from '@/services/user';
import { getAuthRequest, extendAuthRequest } from './auth-request';
import { getAuthTimeoutError } from './timeout';
import prisma from '@/core/helpers/prisma';
import { verifyPassword } from './password';
import { makeSessionFromRequest } from '@/core/auth/makeSession';

const neupIdSchema = z.object({
    neupId: z.string().min(1, "NeupID is required."),
    authRequestId: z.string(),
});

const passwordSchema = z.object({
    password: z.string().min(1, "Password is required."),
    authRequestId: z.string(),
});

/**
 * Type SigninRequestData.
 */
type SigninRequestData = {
    neupId?: string;
    isPendingDeletion?: boolean;
};


/**
 * Function submitNeupId.
 */
export async function submitNeupId(data: z.infer<typeof neupIdSchema>) {
    const validation = neupIdSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: 'Invalid input.' };
    }

    const { neupId, authRequestId } = validation.data;
    const lowerCaseNeupId = neupId.toLowerCase();

    const request = await getAuthRequest(authRequestId, { expectedType: 'signin' });
    if (!request) {
        return { success: false, error: getAuthTimeoutError('signin') };
    }

    const validationResult = await validateNeupId(lowerCaseNeupId);
    if (!validationResult.success && validationResult.error !== 'pending_deletion') {
        return { success: false, error: validationResult.error || 'Invalid NeupID.' };
    }

    const neupIdRecord = await prisma.neupId.findUnique({
        where: { id: lowerCaseNeupId },
    });
    const accountId = neupIdRecord?.accountId;

    if (!accountId) {
        return { success: false, error: "Account mapping is missing." };
    }

    // Guest accounts cannot sign in — they have no neupId by design,
    // but guard explicitly in case of data inconsistency.
    const accountCheck = await prisma.account.findUnique({
        where: { id: accountId },
        select: { accountType: true },
    });
    if (accountCheck?.accountType === 'guest') {
        return { success: false, error: 'Invalid NeupID.' };
    }

    const currentData = (request.data.data as SigninRequestData) || {};
    
    await prisma.authnRequest.update({
        where: { id: request.id },
        data: {
            data: {
                ...currentData,
                neupId: lowerCaseNeupId,
                isPendingDeletion: validationResult.error === 'pending_deletion',
            },
            accountId: accountId,
            status: 'pending_password',
        }
    });

    await extendAuthRequest(request.id);

    const { getUserProfile, getUserContacts } = await import('@/services/user');
    const profile = await getUserProfile(accountId);
    const contacts = await getUserContacts(accountId);

    return {
        success: true,
        userInfo: {
            neupId: lowerCaseNeupId,
            firstName: profile?.nameFirst || '',
            middleName: profile?.nameMiddle || '',
            lastName: profile?.nameLast || '',
            phoneNumber: contacts.primaryPhone || '',
        }
    };
}


/**
 * Function submitPasswordWithNeupId.
 * Used when neupId is passed directly (e.g. via URL param).
 * Resolves the account internally and always returns the same error to prevent account enumeration.
 */
export async function submitPasswordWithNeupId(data: { neupId: string; password: string; authRequestId: string }): Promise<{ success: boolean; mfaRequired: boolean; error?: string; isPendingDeletion?: boolean }> {
    const neupId = data.neupId?.trim().toLowerCase();
    const { password, authRequestId } = data;

    if (!neupId || !password || !authRequestId) {
        return { success: false, mfaRequired: false, error: 'Invalid credentials.' };
    }

    const request = await getAuthRequest(authRequestId, { expectedType: 'signin' });
    if (!request) {
        return { success: false, mfaRequired: false, error: getAuthTimeoutError('signin') };
    }

    const neupIdRecord = await prisma.neupId.findUnique({ where: { id: neupId } });
    const accountId = neupIdRecord?.accountId;

    if (!accountId) {
        return { success: false, mfaRequired: false, error: 'Invalid credentials.' };
    }

    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { status: true, accountType: true } });
    if (account?.accountType === 'guest') {
        return { success: false, mfaRequired: false, error: 'Invalid credentials.' };
    }
    const isPendingDeletion = account?.status === 'pending_deletion';

    const passwordRecord = await prisma.authnMethod.findFirst({
        where: { accountId, type: 'password', order: 'primary', status: 'active' },
        select: { value: true },
    });

    if (!passwordRecord) {
        return { success: false, mfaRequired: false, error: 'Invalid credentials.' };
    }

    const passwordCheck = await verifyPassword({ password, storedHash: passwordRecord.value });
    if (passwordCheck.status !== 'valid') {
        return { success: false, mfaRequired: false, error: 'Invalid credentials.' };
    }

    await prisma.authnRequest.update({
        where: { id: request.id },
        data: {
            data: { neupId, isPendingDeletion },
            accountId,
            status: isPendingDeletion ? 'pending_deletion_confirmation' : 'pending_completion',
        },
    });

    if (isPendingDeletion) {
        return { success: true, mfaRequired: false, isPendingDeletion: true };
    }

    const mfaEnabled = false;
    if (mfaEnabled) {
        await prisma.authnRequest.update({ where: { id: request.id }, data: { status: 'pending_mfa' } });
        await extendAuthRequest(request.id);
        return { success: true, mfaRequired: true };
    }

    const sessionResult = await makeSessionFromRequest({ accountId, loginType: 'Password' });
    if (!sessionResult.success) {
        return { success: false, mfaRequired: false, error: sessionResult.error || 'Failed to create session.' };
    }

    await prisma.authnRequest.update({ where: { id: request.id }, data: { status: 'completed' } });
    return { success: true, mfaRequired: false };
}


/**
 * Function submitPassword.
 */
export async function submitPassword(data: z.infer<typeof passwordSchema>): Promise<{ success: boolean; mfaRequired: boolean; error?: string; isPendingDeletion?: boolean }> {
    const validation = passwordSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, mfaRequired: false, error: 'Invalid input.' };
    }

    const { password, authRequestId } = validation.data;

    const request = await getAuthRequest(authRequestId, { expectedType: 'signin' });
    if (!request || !request.data.accountId) {
        return { success: false, mfaRequired: false, error: getAuthTimeoutError('signin') };
    }

    const accountId = request.data.accountId;
    const requestData = (request.data.data as SigninRequestData) || {};
    const isPendingDeletion = requestData.isPendingDeletion;

    const passwordRecord = await prisma.authnMethod.findFirst({
        where: {
            accountId,
            type: 'password',
            order: 'primary',
            status: 'active',
        },
        select: { value: true },
    });
    if (!passwordRecord) {
        return { success: false, mfaRequired: false, error: "Invalid credentials." };
    }

    const passwordCheck = await verifyPassword({
        password,
        storedHash: passwordRecord.value,
    });

    if (passwordCheck.status !== 'valid') {
        return { success: false, mfaRequired: false, error: "Invalid credentials." };
    }

    if (isPendingDeletion) {
        return { success: true, mfaRequired: false, isPendingDeletion: true };
    }

    const mfaEnabled = false;
    if (mfaEnabled) {
        await prisma.authnRequest.update({
            where: { id: request.id },
            data: { status: 'pending_mfa' }
        });
        await extendAuthRequest(request.id);
        return { success: true, mfaRequired: true };
    } else {
        const sessionResult = await makeSessionFromRequest({
            accountId,
            loginType: 'Password',
        });

        if (!sessionResult.success) {
            return { success: false, mfaRequired: false, error: sessionResult.error || 'Failed to create session.' };
        }

        await prisma.authnRequest.update({
            where: { id: request.id },
            data: { status: 'completed' }
        });

        return { success: true, mfaRequired: false };
    }
}
