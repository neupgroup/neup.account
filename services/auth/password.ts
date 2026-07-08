"use server";

import bcrypt from 'bcryptjs';
import prisma from '@/core/helpers/prisma';

/**
 * Status returned by password validation.
 */
export type PasswordCheckStatus = 'valid' | 'invalid' | 'expired' | 'unauthorized';


/**
 * Standard password-check response.
 */
export type PasswordCheckResult = {
	status: PasswordCheckStatus;
};


/**
 * Input accepted by the core password verifier.
 */
export type VerifyPasswordInput = {
	password?: string | null;
	storedHash?: string | null;
	expiresOn?: Date | string | null;
	minLength?: number;
	requireHash?: boolean;
};



/**
 * Password payload extracted from a POST body or a form submission.
 */
export type PasswordPayload = {
	password?: string | null;
	currentPassword?: string | null;
	newPassword?: string | null;
};


/**
 * Input required to change an account password.
 */
export type ChangePasswordInput = {
	accountId: string;
	currentPassword: string;
	newPassword: string;
	minLength?: number;
};


/**
 * Result returned by password change.
 */
export type ChangePasswordResult = {
	success: boolean;
	error?: string;
};


/**
 * Function normalizeExpiresOn.
 */
function normalizeExpiresOn(expiresOn?: Date | string | null): Date | null {
	if (!expiresOn) return null;
	return expiresOn instanceof Date ? expiresOn : new Date(expiresOn);
}


/**
 * Function extractPassword.
 */
function extractPassword(payload: PasswordPayload | FormData, fieldName?: string): string {
	if (payload instanceof FormData) {
		const preferredKeys = fieldName ? [fieldName] : ['password', 'currentPassword', 'newPassword'];
		for (const key of preferredKeys) {
			const value = payload.get(key);
			if (typeof value === 'string') return value;
		}
		return '';
	}

	if (fieldName && typeof payload[fieldName as keyof PasswordPayload] === 'string') {
		return payload[fieldName as keyof PasswordPayload] as string;
	}

	return payload.password || payload.currentPassword || payload.newPassword || '';
}


/**
 * Validates a password string and optionally compares it with a stored hash.
 */
export async function verifyPassword(input: VerifyPasswordInput): Promise<PasswordCheckResult> {
	const password = input.password?.toString() || '';
	const minLength = input.minLength ?? 1;
	const expiresOn = normalizeExpiresOn(input.expiresOn);

	if (expiresOn && expiresOn.getTime() <= Date.now()) {
		return { status: 'expired' };
	}

	if (!password.trim()) {
		return { status: 'invalid' };
	}

	if (password.length < minLength) {
		return { status: 'invalid' };
	}

	if (input.requireHash && !input.storedHash) {
		return { status: 'unauthorized' };
	}

	if (input.storedHash) {
		try {
			const isMatch = await bcrypt.compare(password, input.storedHash);
			return { status: isMatch ? 'valid' : 'invalid' };
		} catch {
			return { status: 'invalid' };
		}
	}

	return { status: 'valid' };
}



/**
 * Validates a password from a POST body.
 */
export async function verifyPasswordFromPost(
	input: Request | PasswordPayload,
	options: Omit<VerifyPasswordInput, 'password'> & { fieldName?: string } = {}
): Promise<PasswordCheckResult> {
	const payload = input instanceof Request ? await input.json() : input;
	const password = extractPassword(payload, options.fieldName);

	return verifyPassword({
		password,
		storedHash: options.storedHash,
		expiresOn: options.expiresOn,
		minLength: options.minLength,
		requireHash: options.requireHash,
	});
}



/**
 * Validates a password from a form submission.
 */
export async function verifyPasswordFromForm(
	formData: FormData,
	options: Omit<VerifyPasswordInput, 'password'> & { fieldName?: string } = {}
): Promise<PasswordCheckResult> {
	const password = extractPassword(formData, options.fieldName);

	return verifyPassword({
		password,
		storedHash: options.storedHash,
		expiresOn: options.expiresOn,
		minLength: options.minLength,
		requireHash: options.requireHash,
	});
}



/**
 * Changes a password by verifying current credentials and storing a new hash.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
	const accountId = input.accountId?.trim();
	const currentPassword = input.currentPassword || '';
	const newPassword = input.newPassword || '';
	const minLength = input.minLength ?? 8;

	if (!accountId) {
		return { success: false, error: 'Missing accountId.' };
	}

	const newPasswordCheck = await verifyPassword({
		password: newPassword,
		minLength,
	});

	if (newPasswordCheck.status !== 'valid') {
		return { success: false, error: 'Invalid new password.' };
	}

	try {
		const passwordRecord = await prisma.authnMethod.findFirst({
			where: {
				accountId,
				type: 'password',
				order: 'primary',
				status: 'active',
			},
			select: { value: true },
		});

		if (!passwordRecord?.value) {
			return { success: false, error: 'Authentication data not found.' };
		}

		const currentPasswordCheck = await verifyPassword({
			password: currentPassword,
			storedHash: passwordRecord.value,
			requireHash: true,
		});

		if (currentPasswordCheck.status !== 'valid') {
			return { success: false, error: 'Current password is incorrect.' };
		}

		const newHashedPassword = await bcrypt.hash(newPassword, 10);

		await prisma.authnMethod.updateMany({
			where: {
				accountId,
				type: 'password',
				order: 'primary',
			},
			data: {
				value: newHashedPassword,
				status: 'active',
			},
		});

		return { success: true };
	} catch {
		return { success: false, error: 'Failed to change password.' };
	}
}