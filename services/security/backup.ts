'use server';

import { permission } from '@/logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { getPersonalAccountId } from '@/neup.core/auth/verify';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { checkPermissions } from '@/services/user';
import { createNotification } from '../notifications';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';

/**
 * Type BackupCode.
 */
export type BackupCode = {
    code: string;
    used: boolean;
};


/**
 * Function generateSingleCode.
 */
function generateSingleCode(): string {
    // Generates an 8-character alphanumeric code.
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const AUTH_METHOD_BACKUP_TYPE = 'backupCodes';

const servicePermissions = [
    permission('security.backup_codes.view', 'for_individual', 'service'),
    permission('security.backup_codes.create', 'for_individual', 'service'),
];

function readBackupCodes(detail: unknown): BackupCode[] {
    if (!detail || typeof detail !== 'object') return [];
    const codes = (detail as { codes?: Array<{ code?: string; status?: string }> }).codes;
    if (!Array.isArray(codes)) return [];

    return codes
        .filter((item) => typeof item?.code === 'string')
        .map((item) => ({
            code: item.code as string,
            used: item.status === 'used',
        }));
}

function writeBackupCodes(codes: BackupCode[]) {
    return {
        codes: codes.map((item) => ({
            code: item.code,
            status: item.used ? 'used' : 'active',
        })),
    };
}


/**
 * Function getBackupCodes.
 */
export async function getBackupCodes(): Promise<BackupCode[]> {
    await requireAnyPermission404(['security.backup_codes.view']);
    const canView = await checkPermissions(['security.backup_codes.view']);
    if (!canView) return [];

    const accountId = await getPersonalAccountId();
    if (!accountId) return [];

    try {
        const row = await prisma.authnMethod.findFirst({
            where: {
                accountId,
                type: AUTH_METHOD_BACKUP_TYPE,
                order: 'backup',
                status: 'active',
            },
            select: { detail: true },
        });

        return readBackupCodes(row?.detail);

    } catch (error) {
        await logError('database', error, `getBackupCodes: ${accountId}`);
        return [];
    }
}


/**
 * Function generateBackupCodes.
 */
export async function generateBackupCodes(): Promise<BackupCode[]> {
    await requireAnyPermission404(['security.backup_codes.create']);
    const canCreate = await checkPermissions(['security.backup_codes.create']);
    if (!canCreate) throw new Error("Permission denied.");

    const accountId = await getPersonalAccountId();
    if (!accountId) {
        throw new Error("User not authenticated.");
    }

    try {
        const newCodes: BackupCode[] = Array.from({ length: 10 }, () => ({
            code: generateSingleCode(),
            used: false,
        }));

        await prisma.authnMethod.upsert({
            where: {
                accountId_type_order: {
                    accountId,
                    type: AUTH_METHOD_BACKUP_TYPE,
                    order: 'backup',
                },
            },
            update: {
                status: 'active',
                value: 'backupCodes',
                detail: writeBackupCodes(newCodes) as any,
            },
            create: {
                accountId,
                type: AUTH_METHOD_BACKUP_TYPE,
                order: 'backup',
                status: 'active',
                value: 'backupCodes',
                detail: writeBackupCodes(newCodes) as any,
            },
        });

        await logActivity(accountId, 'Generated new backup codes', 'Success');
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: 'New backup codes were generated for your account. Your old codes are now invalid.',
        });

        revalidatePath('/manage/security/backup');
        return newCodes;

    } catch (error) {
        await logError('database', error, `generateBackupCodes: ${accountId}`);
        throw new Error('Could not generate backup codes.');
    }
}
