"use server";

import { headers } from 'next/headers';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { authenticator } from 'otplib';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { logError } from '@/core/helpers/logger';
import { createNotification } from '@/services/notifications';
import { encrypt, decrypt } from '@/services/security/totp';
import { createAndSetSession } from '@/core/auth/session';
import { getAuthRequest } from './auth-request';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

/**
 * Result returned by TOTP helpers.
 */
export type TotpActionResult = {
	success: boolean;
	error?: string;
};


/**
 * Input for adding/enabling TOTP.
 */
export type AddTotpInput = {
	secret: string;
	token: string;
};


/**
 * Input for revoking/disabling TOTP.
 */
export type RevokeTotpInput = {
	password: string;
};


/**
 * Input for direct token verification.
 */
export type VerifyTotpInput = {
	accountId: string;
	token: string;
};


/**
 * Input for MFA request-flow verification.
 */
export type VerifyTotpFromRequestInput = {
	authRequestId: string;
	token: string;
};



const verifyTotpRequestSchema = z.object({
	token: z.string().length(6, 'Your one-time password must be 6 characters.'),
	authRequestId: z.string().min(1),
});

const AUTH_METHOD_TOTP_TYPE = 'totpToken';


/**
 * Adds (enables) TOTP after verifying the token against the provided secret.
 */
export async function addTotp(input: AddTotpInput): Promise<TotpActionResult> {
	await requireAnyPermission404(['security.totp.add']);
	const canAdd = await checkPermissions(['security.totp.add']);
	if (!canAdd) return { success: false, error: 'Permission denied.' };

	const accountId = await getActiveAccountId();
	if (!accountId) return { success: false, error: 'User not authenticated.' };

	const secret = input.secret?.trim() || '';
	const token = input.token?.trim() || '';

	if (!secret || token.length !== 6) {
		return { success: false, error: 'Invalid secret or token.' };
	}

	const isValid = authenticator.verify({ token, secret });
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
				},
			}),
			prisma.authnMethod.create({
				data: {
					accountId,
					type: AUTH_METHOD_TOTP_TYPE,
					value: encryptedSecret,
					order: 'secondary',
					status: 'active',
				},
			}),
		]);

		await logActivity(accountId, activityAction.totpEnabled(), 'Success');
		await createNotification({
			recipient_id: accountId,
			action: 'informative.security',
			message: 'Two-factor authentication (2FA) has been enabled on your account.',
		});

		return { success: true };
	} catch (error) {
		await logError('database', error, `addTotp:${accountId}`);
		return { success: false, error: 'Could not enable TOTP.' };
	}
}


/**
 * Revokes (disables) TOTP after verifying the current password.
 */
export async function revokeTotp(input: RevokeTotpInput): Promise<TotpActionResult> {
	await requireAnyPermission404(['security.totp.remove']);
	const canRemove = await checkPermissions(['security.totp.remove']);
	if (!canRemove) return { success: false, error: 'Permission denied.' };

	const accountId = await getActiveAccountId();
	if (!accountId) return { success: false, error: 'User not authenticated.' };

	const password = input.password?.trim() || '';
	if (!password) {
		return { success: false, error: 'Password is required.' };
	}

	try {
		const authDoc = await prisma.authnMethod.findFirst({
			where: {
				accountId,
				type: 'password',
				order: 'primary',
				status: 'active',
			},
			select: { value: true },
		});

		if (!authDoc?.value) {
			return { success: false, error: 'Authentication data not found.' };
		}

		const isMatch = await bcrypt.compare(password, authDoc.value);
		if (!isMatch) {
			await logActivity(accountId, 'TOTP Disable Failed', 'Failed');
			return { success: false, error: 'The password you entered is incorrect.' };
		}

		await prisma.authnMethod.deleteMany({
			where: {
				accountId,
				type: AUTH_METHOD_TOTP_TYPE,
			},
		});

		await logActivity(accountId, activityAction.totpDisabled(), 'Success');
		await createNotification({
			recipient_id: accountId,
			action: 'informative.security',
			message: 'Two-factor authentication (2FA) has been disabled on your account.',
		});

		return { success: true };
	} catch (error) {
		await logError('database', error, `revokeTotp:${accountId}`);
		return { success: false, error: 'Could not disable TOTP.' };
	}
}


/**
 * Verifies a TOTP token for a specific account.
 */
export async function verifyTotp(input: VerifyTotpInput): Promise<TotpActionResult> {
	const accountId = input.accountId?.trim();
	const token = input.token?.trim();

	if (!accountId || !token) {
		return { success: false, error: 'Missing authentication data.' };
	}

	try {
		const totp = await prisma.authnMethod.findFirst({
			where: {
				accountId,
				type: AUTH_METHOD_TOTP_TYPE,
				status: 'active',
			},
			select: { value: true },
		});

		if (!totp?.value) {
			return { success: false, error: 'TOTP not enabled for this account.' };
		}

		const secret = await decrypt(totp.value);
		const isValid = authenticator.verify({ token, secret });

		if (!isValid) {
			return { success: false, error: 'Invalid token. Please check your device time and try again.' };
		}

		return { success: true };
	} catch (error) {
		await logError('database', error, `verifyTotp:${accountId}`);
		return { success: false, error: 'Could not verify TOTP.' };
	}
}


/**
 * Verifies a TOTP token from a POST body and completes sign-in.
 */
export async function verifyTotpFromPost(
	input: Request | VerifyTotpFromRequestInput
): Promise<TotpActionResult> {
	const payload = input instanceof Request ? await input.json() : input;
	const validation = verifyTotpRequestSchema.safeParse(payload);

	if (!validation.success) {
		return { success: false, error: validation.error.flatten().fieldErrors.token?.[0] };
	}

	const { token, authRequestId } = validation.data;
	const request = await getAuthRequest(authRequestId, { expectedType: 'signin' });

	if (!request || !request.data.accountId) {
		return { success: false, error: 'Your session has expired. Please try again.' };
	}

	const accountId = request.data.accountId;
	const status = request.data.status;
	if (!accountId || status !== 'pending_mfa') {
		return { success: false, error: 'Invalid authentication request state.' };
	}

	const verification = await verifyTotp({ accountId, token });
	if (!verification.success) {
		return verification;
	}

	const headersList = await headers();
	const ipAddress = headersList.get('x-forwarded-for') || 'Unknown IP';
	const userAgent = headersList.get('user-agent') || 'Unknown User-Agent';

	await logActivity(accountId, activityAction.login(), 'Success', ipAddress);
	await createAndSetSession(accountId, 'Password + TOTP', ipAddress, userAgent);

	return { success: true };
}


/**
 * Verifies a TOTP token from FormData and completes sign-in.
 */
export async function verifyTotpFromForm(formData: FormData): Promise<TotpActionResult> {
	const token = formData.get('token');
	const authRequestId = formData.get('authRequestId');

	return verifyTotpFromPost({
		token: typeof token === 'string' ? token : '',
		authRequestId: typeof authRequestId === 'string' ? authRequestId : '',
	});
}
