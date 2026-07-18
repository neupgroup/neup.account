'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/database/prisma';
import { getActiveAccountId } from '@/services/account/verify';
import { getUserNeupIds, checkPermissions } from '@/services/user';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/logica/logger/files';
import { z } from 'zod';
import crypto from 'crypto';
import { totpEnableSchema, totpDisableSchema } from '@/services/security/schema';
import { createNotification } from '../notifications';
import { createHash, randomBytes } from 'crypto';
import { activityAction } from '@/services/activity-action';
import { requireAnyPermission404 } from '@/services/account/permission-guards';

// We need a consistent secret for encryption. STORE THIS IN A SECURE VAULT.
// For this example, it's in an environment variable.
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_TOTP_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 64) {
    throw new Error('A 32-byte (64-character hex) NEXT_PUBLIC_TOTP_ENCRYPTION_KEY must be set in .env');
}

const AUTH_METHOD_TOTP_TYPE = 'totpToken';

const servicePermissions = [
    permission('security.totp.add', 'for_individual', 'service'),
    permission('security.totp.remove', 'for_individual', 'service'),
];

// Basic encryption/decryption functions using Node.js crypto
// In a production app, use a dedicated KMS for this.
export async function encrypt(text: string): Promise<string> {
    const { subtle } = await import('crypto');
    const key = await subtle.importKey('raw', Buffer.from(ENCRYPTION_KEY!, 'hex'), { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.randomBytes(12);
    const encoded = new TextEncoder().encode(text);
    const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return `${iv.toString('hex')}:${Buffer.from(encrypted).toString('hex')}`;
}


/**
 * Function decrypt.
 */
export async function decrypt(encryptedText: string): Promise<string> {
    const { subtle } = await import('crypto');
    const [ivHex, encryptedHex] = encryptedText.split(':');
    if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted text format');
    
    const key = await subtle.importKey('raw', Buffer.from(ENCRYPTION_KEY!, 'hex'), { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
}


// Check if TOTP is enabled for the current user
export async function getTotpStatus(): Promise<{ isEnabled: boolean }> {
    await requireAnyPermission404(['security.totp.add', 'security.totp.remove']);
    const accountId = await getActiveAccountId();
    if (!accountId) return { isEnabled: false };

    const totp = await prisma.authnMethod.findFirst({
        where: {
            accountId,
            type: AUTH_METHOD_TOTP_TYPE,
            status: 'active',
        }
    });

    return { isEnabled: !!totp };
}


// Generate a new secret and QR code for setup
export async function generateTotpSecret(): Promise<{ secret: string; qrCodeUrl: string }> {
    await requireAnyPermission404(['security.totp.add']);
    const accountId = await getActiveAccountId();
    if (!accountId) throw new Error('User not authenticated');

    const neupIds = await getUserNeupIds(accountId);
    const neupId = neupIds[0] || accountId;

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(neupId, 'NeupID', secret);

    const qrCodeUrl = await qrcode.toDataURL(otpAuthUrl);

    return { secret, qrCodeUrl };
}


// Verify the token and enable TOTP
export async function verifyAndEnableTotp(data: z.infer<typeof totpEnableSchema>): Promise<{ success: boolean; error?: string }> {
    await requireAnyPermission404(['security.totp.add']);
    const canAdd = await checkPermissions(['security.totp.add']);
    if (!canAdd) return { success: false, error: 'Permission denied.' };

    const validation = totpEnableSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.token?.[0] };
    }
    
    const { secret, token } = validation.data;
    const accountId = await getActiveAccountId();
    if (!accountId) return { success: false, error: 'User not authenticated' };
    
    const isValid = authenticator.verify({ token, secret } as any);
    
    if (!isValid) {
        return { success: false, error: 'Invalid token. Please check your device time and try again.' };
    }

    try {
        const encryptedSecret = await encrypt(secret);
        
        await prisma.$transaction([
            prisma.authnMethod.deleteMany({
                where: {
                    accountId,
                    type: AUTH_METHOD_TOTP_TYPE,
                }
            }),
            prisma.authnMethod.create({
                data: {
                    accountId,
                    type: AUTH_METHOD_TOTP_TYPE,
                    value: encryptedSecret,
                    order: 'secondary',
                    status: 'active',
                }
            })
        ]);

        await logActivity(accountId, activityAction.totpEnabled(), 'Success');
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: 'Two-factor authentication (2FA) has been enabled on your account.',
        });

        return { success: true };
    } catch(error) {
        await logError('database', error, `verifyAndEnableTotp: ${accountId}`);
        return { success: false, error: 'Could not enable TOTP.' };
    }
}


// Disable TOTP for the user
export async function disableTotp(data: z.infer<typeof totpDisableSchema>): Promise<{ success: boolean; error?: string }> {
    await requireAnyPermission404(['security.totp.remove']);
    const canRemove = await checkPermissions(['security.totp.remove']);
    if (!canRemove) return { success: false, error: 'Permission denied.' };
    
    const validation = totpDisableSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.password?.[0] };
    }
    const { password } = validation.data;
    const accountId = await getActiveAccountId();
    if (!accountId) return { success: false, error: 'User not authenticated' };

    try {
        // 1. Verify password
        const authDoc = await prisma.authnMethod.findFirst({
            where: {
                accountId,
                type: 'password',
                order: 'primary',
                status: 'active',
            },
            select: { value: true },
        });

        if (!authDoc) {
            return { success: false, error: "Authentication data not found." };
        }

        const isMatch = await bcrypt.compare(password, authDoc.value);
        if (!isMatch) {
            await logActivity(accountId, 'TOTP Disable Failed', 'Failed');
            return { success: false, error: "The password you entered is incorrect." };
        }

        // 2. Delete TOTP secret
        await prisma.authnMethod.deleteMany({
            where: {
                accountId,
                type: AUTH_METHOD_TOTP_TYPE,
            }
        });

        await logActivity(accountId, activityAction.totpDisabled(), 'Success');
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: 'Two-factor authentication (2FA) has been disabled on your account.',
        });

        return { success: true };

    } catch(error) {
        await logError('database', error, `disableTotp: ${accountId}`);
        return { success: false, error: 'Could not disable TOTP.' };
    }
}


// Gets the current server time
export async function getServerTime(): Promise<string> {
    return new Date().toISOString();
}
