"use server";

import prisma from '@/core/helpers/prisma';
import { createAndSetSession } from '@/logica/account/session';
import { getActiveSession } from '@/logica/account/verify';
import { makeNotification } from '@/services/notifications';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';

/*
::neup.documentation::auth-session-service
::title Auth Session Service

Session validation, expiry, creation, and bridge-session helpers.

::public

This file owns the service-layer behavior behind internal keepalive, logout, refresh, and low-level session checks.

::public end

::private

Route files own the HTTP contract. This file owns the database checks, block-state handling, and cookie-session refresh helpers.

::private end

::end
*/

/**
 * Reasons returned when auth validation fails.
 */
type AuthValidationReason = '404' | 'accountBlocked' | 'invalidSource';


/**
 * Standard response shape for auth validation.
 */
export type AuthValidationResult =
	| {
		status: 'valid';
		validTill: string;
	}
	| {
		status: 'invalid' | 'expired';
		reason?: AuthValidationReason;
	};


/**
 * Inputs required to validate a session without reading cookies.
 */
export type ValidateAuthSessionInput = {
	aid: string;
	sid: string;
	skey: string;
};


/**
 * Standard response returned after expiring a session.
 */
export type ExpireSessionResult = {
	success: boolean;
	error?: string;
};


/**
 * Inputs required to expire a session.
 */
export type ExpireSessionInput = {
	aid: string;
	sid: string;
	skey: string;
};


/**
 * Input required to create a session.
 */
export type MakeSessionInput = {
	accountId: string;
	loginType: string;
	geolocation?: string;
	ipAddress: string;
	userAgent: string;
};


/**
 * Standard response returned by session creation helper.
 */
export type MakeSessionResult = {
	success: boolean;
	error?: string;
};


/**
 * Type BridgeAuthSessionError.
 */
export type BridgeAuthSessionError = {
	error: string;
	error_description?: string;
};

/**
 * Input required to validate a session.
 */
export type ValidateSessionInput = {
	sessionId: string;
	sessionKey: string;
	accountId: string;
};

/**
 * Simple response for session validation.
 */
export type ValidateSessionResponse = {
	valid: boolean;
};


/**
 * Minimal block metadata used to determine whether an account is blocked.
 */
type BlockInfo = {
	is_permanent?: boolean;
	until?: string | Date;
} | null;


/**
 * Returns true when a block is currently active.
 */
function hasActiveBlock(block: BlockInfo, now: Date): boolean {
	if (!block) return false;

	if (block.is_permanent) return true;

	if (block.until) {
		return new Date(block.until) > now;
	}

	return false;
}


/**
 * ::neup.documentation::validate-auth-session
 * ::function validateAuthSession(input)
 *
 * Validates an auth session triplet.
 *
 * ::public
 *
 * The function returns whether the session is `valid`, `invalid`, or `expired`.
 *
 * ::public end
 *
 * ::private
 *
 * Validation checks the session row, matching account/key values, expiry, and account block state.
 *
 * ::private end
 *
 * ::end
 */
/**
 * Validates the provided auth session values against the database.
 */
export async function validateAuthSession(input: ValidateAuthSessionInput): Promise<AuthValidationResult> {
	const { aid, sid, skey } = input;

	if (!aid || !sid || !skey) {
		return { status: 'invalid', reason: 'invalidSource' };
	}

	const session = await prisma.authnSession.findUnique({
		where: { id: sid },
		select: { accountId: true, key: true, validTill: true },
	});

	if (!session) {
		return { status: 'invalid', reason: '404' };
	}

	if (session.accountId !== aid || session.key !== skey) {
		return { status: 'invalid', reason: 'invalidSource' };
	}

	const now = new Date();
	const validTill = session.validTill;

	if (!validTill || validTill <= now) {
		return {
			status: 'expired',
		};
	}

	const account = await prisma.account.findUnique({
		where: { id: aid },
		select: {
			id: true,
			status: true,
			details: true,
		},
	});

	if (!account) {
		return {
			status: 'invalid',
			reason: '404',
		};
	}

	const details = account.details as Record<string, unknown> | null;
	const block = (details?.block as BlockInfo) || null;

	if (account.status === 'blocked' && hasActiveBlock(block, now)) {
		return {
			status: 'invalid',
			reason: 'accountBlocked',
		};
	}

	return {
		status: 'valid',
		validTill: validTill.toISOString(),
	};
}


/**
 * Marks a session as expired in the database.
 */
export async function expireSession(input: ExpireSessionInput): Promise<ExpireSessionResult> {
	const aid = input.aid?.trim();
	const sid = input.sid?.trim();
	const skey = input.skey?.trim();

	if (!aid || !sid || !skey) {
		return { success: false, error: 'Missing session details.' };
	}

	try {
		const session = await prisma.authnSession.findUnique({
			where: { id: sid },
			select: {
				accountId: true,
				key: true,
			},
		});

		if (!session) {
			return { success: false, error: 'Session not found.' };
		}

		if (session.accountId !== aid || session.key !== skey) {
			return { success: false, error: 'Invalid session.' };
		}

		await prisma.authnSession.update({
			where: { id: sid },
			data: {
				validTill: new Date(),
			},
		});

		await makeNotification({
			recipient_id: aid,
			action: 'informative.logout',
			message: 'You logged out from a device.',
		});

		return { success: true };
	} catch {
		return { success: false, error: 'Failed to expire session.' };
	}
}


/**
 * Creates a session using the current request headers for device context.
 */
export async function makeSession(input: MakeSessionInput): Promise<MakeSessionResult> {
	const accountId = input.accountId?.trim();
	const loginType = input.loginType?.trim();
	const ipAddress = input.ipAddress?.trim();
	const userAgent = input.userAgent?.trim();

	if (!accountId || !loginType || !ipAddress || !userAgent) {
		return { success: false, error: 'Missing accountId, loginType, or device context.' };
	}

	try {
		await createAndSetSession(accountId, loginType, ipAddress, userAgent, input.geolocation);
		await logActivity(accountId, activityAction.login(), 'Success', ipAddress, undefined, input.geolocation);
		await makeNotification({
			recipient_id: accountId,
			action: 'informative.login',
			message: 'You signed in from a new device.',
		});

		return { success: true };
	} catch {
		return { success: false, error: 'Failed to create session.' };
	}
}


/**
 * ::neup.documentation::bridge-session-refresh
 * ::function bridgeValidateAndRefreshSession(input)
 *
 * Validates and extends a bridge session.
 *
 * ::public
 *
 * This is the service used by the bridge session keepalive endpoint.
 *
 * ::public end
 *
 * ::private
 *
 * The function validates the session triplet, optionally updates session metadata, and extends expiry when the session remains valid.
 *
 * ::private end
 *
 * ::end
 */
/**
 * Function bridgeValidateAndRefreshSession.
 */
export async function bridgeValidateAndRefreshSession(input: {
	aid?: string;
	sid?: string;
	skey?: string;
	deviceType?: string;
	activity?: string;
}): Promise<{ status: number; body: BridgeAuthSessionError | { success: true; session: { aid: string; sid: string; validTill: Date | null; deviceType: string | null } } }> {
	const { aid, sid, skey, deviceType } = input;

	if (!aid || !sid || !skey) {
		return {
			status: 400,
			body: { error: 'invalid_request', error_description: 'Missing aid, sid, or skey' },
		};
	}

	try {
		const session = await prisma.authnSession.findUnique({
			where: { id: sid },
			include: { account: true },
		});

		if (!session || session.accountId !== aid || session.key !== skey) {
			return {
				status: 401,
				body: { error: 'invalid_session', error_description: 'Session not found or invalid' },
			};
		}

		if (session.validTill && session.validTill < new Date()) {
			return {
				status: 401,
				body: { error: 'session_expired', error_description: 'Session has expired' },
			};
		}

		const newExpiry = new Date();
		newExpiry.setDate(newExpiry.getDate() + 30);

		const updatedSession = await prisma.authnSession.update({
			where: { id: sid },
			data: {
				validTill: newExpiry,
				...(deviceType ? { deviceType } : {}),
			},
		});

		return {
			status: 200,
			body: {
				success: true,
				session: {
					aid: updatedSession.accountId,
					sid: updatedSession.id,
					validTill: updatedSession.validTill,
					deviceType: updatedSession.deviceType,
				},
			},
		};
	} catch (error) {
		return { status: 500, body: { error: 'internal_server_error' } };
	}
}


/**
 * ::neup.documentation::bridge-session-invalidate
 * ::function bridgeInvalidateSession(input)
 *
 * Invalidates a bridge session.
 *
 * ::public
 *
 * This is the service used by the bridge logout endpoint.
 *
 * ::public end
 *
 * ::private
 *
 * The function validates the caller-provided session triplet and expires the matching session row.
 *
 * ::private end
 *
 * ::end
 */
/**
 * Function bridgeInvalidateSession.
 */
export async function bridgeInvalidateSession(input: {
  aid?: string;
	sid?: string;
	skey?: string;
}): Promise<{ status: number; body: BridgeAuthSessionError | { success: true; message: string } }> {
	const { aid, sid, skey } = input;

	if (!aid || !sid || !skey) {
		return {
			status: 400,
			body: { error: 'invalid_request', error_description: 'Missing aid, sid, or skey' },
		};
	}

	try {
		const session = await prisma.authnSession.updateMany({
			where: {
				id: sid,
				accountId: aid,
				key: skey,
			},
			data: {
				validTill: new Date(),
			},
		});

		if (session.count === 0) {
			return {
				status: 404,
				body: { error: 'not_found', error_description: 'Session not found' },
			};
		}

		return { status: 200, body: { success: true, message: 'Session invalidated' } };
	} catch (error) {
		return { status: 500, body: { error: 'internal_server_error' } };
	}
}


/**
 * Function bridgeRefreshSessionExpiry.
 */
export async function bridgeRefreshSessionExpiry(): Promise<{ status: number; body: { success: boolean; error?: string; newExpiresOn?: string } }> {
	try {
		const session = await getActiveSession();

		if (!session) {
			return { status: 401, body: { success: false, error: 'Unauthenticated.' } };
		}

		const newExpiresOn = new Date();
		newExpiresOn.setDate(newExpiresOn.getDate() + 30);

		await prisma.authnSession.update({
			where: { id: session.sessionId },
			data: { validTill: newExpiresOn },
		});

		return { status: 200, body: { success: true, newExpiresOn: newExpiresOn.toISOString() } };
	} catch {
		return { status: 500, body: { success: false, error: 'Internal server error.' } };
	}
}

/**
 * Validates a session against the database.
 * @param input - Contains sessionId, sessionKey, and accountId
 * @returns { valid: true } if session is valid, { valid: false } otherwise
 */
export async function validateSession(input: ValidateSessionInput): Promise<ValidateSessionResponse> {
	const { sessionId, sessionKey, accountId } = input;

	// Validate all required inputs
	if (!sessionId || !sessionKey || !accountId) {
		return { valid: false };
	}

	try {
		// 1. Verify the session exists and matches the provided values
		const session = await prisma.authnSession.findUnique({
			where: { id: sessionId },
			select: {
				accountId: true,
				key: true,
				validTill: true,
			},
		});

		if (!session) {
			return { valid: false };
		}

		// 2. Verify session credentials match
		if (session.accountId !== accountId || session.key !== sessionKey) {
			return { valid: false };
		}

		// 3. Check if session is expired
		const now = new Date();
		if (!session.validTill || session.validTill <= now) {
			return { valid: false };
		}

		// 4. Verify the account is not blocked
		const account = await prisma.account.findUnique({
			where: { id: accountId },
			select: {
				id: true,
				status: true,
				details: true,
			},
		});

		if (!account) {
			return { valid: false };
		}

		const details = account.details as Record<string, unknown> | null;
		const block = (details?.block as BlockInfo) || null;

		if (account.status === 'blocked' && hasActiveBlock(block, now)) {
			return { valid: false };
		}

		// All checks passed
		return { valid: true };
	} catch {
		return { valid: false };
	}
}
