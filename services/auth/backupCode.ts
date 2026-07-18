"use server";

import { permission } from '@/logica/permission';
import prisma from '@/core/database/prisma';
import crypto from 'crypto';
import { getPersonalAccountId } from '@/services/account/verify';
import { checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/logica/logger/files';
import { createNotification } from '@/services/notifications';
import { requireAnyPermission404 } from '@/services/account/permission-guards';

/**
 * Public backup code shape.
 */
export type BackupCode = {
	code: string;
	used: boolean;
};


/**
 * Generic backup operation result.
 */
export type BackupCodeActionResult = {
	success: boolean;
	error?: string;
	code?: string;
	codes?: BackupCode[];
};


/**
 * Input for verifying a backup code.
 */
export type VerifyBackupCodeInput = {
	accountId: string;
	code: string;
};


/**
 * Input for expiring a backup code.
 */
export type ExpireBackupCodeInput = {
	accountId: string;
	code: string;
};


/**
 * Function generateSingleCode.
 */
function generateSingleCode(): string {
	return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const AUTH_METHOD_BACKUP_TYPE = 'backupCodes';

const servicePermissions = [
    permission('security.backup_codes.create', 'for_individual', 'service'),
    permission('security.backup_codes.view', 'for_individual', 'service'),
];

function readBackupCodes(detail: unknown): BackupCode[] {
	if (!detail || typeof detail !== 'object') return [];
	const codes = (detail as { codes?: Array<{ code?: string; status?: string }> }).codes;
	if (!Array.isArray(codes)) return [];
	return codes
		.filter((item) => typeof item?.code === 'string')
		.map((item) => ({ code: item.code as string, used: item.status === 'used' }));
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
 * Verifies a backup code and marks it used when valid.
 */
export async function verifyBackupCode(input: VerifyBackupCodeInput): Promise<BackupCodeActionResult> {
	const accountId = input.accountId?.trim();
	const code = input.code?.trim().toUpperCase();

	if (!accountId || !code) {
		return { success: false, error: 'Missing accountId or code.' };
	}

	try {
		const existing = await prisma.authnMethod.findFirst({
			where: {
				accountId,
				type: AUTH_METHOD_BACKUP_TYPE,
				order: 'backup',
				status: 'active',
			},
			select: { id: true, detail: true },
		});

		if (!existing) {
			return { success: false, error: 'Invalid backup code.' };
		}

		const currentCodes = readBackupCodes(existing.detail);
		const target = currentCodes.find((item) => item.code === code && !item.used);
		if (!target) {
			return { success: false, error: 'Invalid backup code.' };
		}

		const nextCodes = currentCodes.map((item) =>
			item.code === code ? { ...item, used: true } : item
		);

		await prisma.authnMethod.update({
			where: { id: existing.id },
			data: { detail: writeBackupCodes(nextCodes) as any },
		});

		return { success: true };
	} catch (error) {
		await logError('database', error, `verifyBackupCode:${accountId}`);
		return { success: false, error: 'Could not verify backup code.' };
	}
}


/**
 * Generates and stores a new set of backup codes for the active account.
 */
export async function generateBackupCode(): Promise<BackupCodeActionResult> {
	await requireAnyPermission404(['security.backup_codes.create']);
	const canCreate = await checkPermissions(['security.backup_codes.create']);
	if (!canCreate) return { success: false, error: 'Permission denied.' };

	const accountId = await getPersonalAccountId();
	if (!accountId) return { success: false, error: 'User not authenticated.' };

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
				detail: writeBackupCodes(newCodes) as any,
				value: 'backupCodes',
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

		return { success: true, codes: newCodes };
	} catch (error) {
		await logError('database', error, `generateBackupCode:${accountId}`);
		return { success: false, error: 'Could not generate backup codes.' };
	}
}


/**
 * Returns backup codes for the active account.
 */
export async function getBackupCode(): Promise<BackupCodeActionResult> {
	await requireAnyPermission404(['security.backup_codes.view']);
	const canView = await checkPermissions(['security.backup_codes.view']);
	if (!canView) return { success: false, error: 'Permission denied.' };

	const accountId = await getPersonalAccountId();
	if (!accountId) return { success: false, error: 'User not authenticated.' };

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

		return {
			success: true,
			codes: readBackupCodes(row?.detail),
		};
	} catch (error) {
		await logError('database', error, `getBackupCode:${accountId}`);
		return { success: false, error: 'Could not fetch backup codes.' };
	}
}


/**
 * Expires a backup code by marking it as used.
 */
export async function expireBackupCode(input: ExpireBackupCodeInput): Promise<BackupCodeActionResult> {
	const accountId = input.accountId?.trim();
	const code = input.code?.trim().toUpperCase();

	if (!accountId || !code) {
		return { success: false, error: 'Missing accountId or code.' };
	}

	try {
		const existing = await prisma.authnMethod.findFirst({
			where: {
				accountId,
				type: AUTH_METHOD_BACKUP_TYPE,
				order: 'backup',
				status: 'active',
			},
			select: { id: true, detail: true },
		});

		if (!existing) {
			return { success: false, error: 'Backup code not found or already expired.' };
		}

		const currentCodes = readBackupCodes(existing.detail);
		const target = currentCodes.find((item) => item.code === code && !item.used);
		if (!target) {
			return { success: false, error: 'Backup code not found or already expired.' };
		}

		const nextCodes = currentCodes.map((item) =>
			item.code === code ? { ...item, used: true } : item
		);

		await prisma.authnMethod.update({
			where: { id: existing.id },
			data: { detail: writeBackupCodes(nextCodes) as any },
		});

		return { success: true, code };
	} catch (error) {
		await logError('database', error, `expireBackupCode:${accountId}`);
		return { success: false, error: 'Could not expire backup code.' };
	}
}
