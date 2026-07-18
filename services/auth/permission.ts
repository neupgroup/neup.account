"use server";

import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { activeAccessWhere, extractRolePermissionNames } from '@/services/access-model';
import { resolveNeupAccountPermissionCandidates } from '@/inapp/permissions/permission-catalog';

/**
 * Reasons returned when permission lookup fails.
 */
type PermissionCheckReason = '404' | 'accountBlocked' | 'invalidSource' | 'forbidden';


/**
 * Standard response shape for permission checks.
 */
export type PermissionCheckResult =
	| {
		status: 'valid';
		validTill: string;
		permissions: string[];
		matched: string[];
	}
	| {
		status: 'invalid' | 'expired';
		reason?: PermissionCheckReason;
		permissions?: string[];
		matched?: string[];
	};


/**
 * Generic mutation result for permission updates/revocations.
 */
export type PermissionMutationResult = {
	success: boolean;
	error?: string;
	permissions?: string[];
};


/**
 * Inputs required to validate access to an app or API element.
 */
export type CheckPermissionInput = {
	app: string;
	api: string;
	sid: string;
	skey: string;
	checkFor: string | string[];
	for_account?: string;
};


/**
 * Inputs required to replace permissions for an account within an app/api scope.
 */
export type UpdatePermissionInput = {
	app: string;
	api?: string;
	sid: string;
	skey: string;
	for_account?: string;
	permissions: string[];
};


/**
 * Inputs required to remove permissions for an account within an app/api scope.
 */
export type RevokePermissionInput = {
	app: string;
	api?: string;
	sid: string;
	skey: string;
	for_account?: string;
	permissions: string | string[];
};


/**
 * Minimal block metadata used to determine whether an account is blocked.
 */
type BlockInfo = {
	is_permanent?: boolean;
	until?: string | Date;
} | null;


/**
 * Session identity after auth validation.
 */
type ResolvedAuth = {
	accountId: string;
	validTill: Date;
};

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
	return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}


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
 * Normalizes a list of permission strings.
 */
function normalizePermissionList(input: string | string[]): string[] {
	const values = Array.isArray(input) ? input : [input];
	return Array.from(
		new Set(
			values
				.map((value) => value.trim())
				.filter((value) => value.length > 0)
		)
	);
}


/**
 * Normalizes a permission or role string for comparisons.
 */
function normalizePermission(value: string): string {
	return value.trim().toLowerCase();
}


/**
 * Checks whether one granted permission implies a required permission.
 */
function hasPermission(granted: Set<string>, required: string): boolean {
  if (granted.has('*')) return true;

  const normalizedRequired = normalizePermission(required);
  if (granted.has(normalizedRequired)) return true;

  for (const candidate of resolveNeupAccountPermissionCandidates(normalizedRequired, 'selfOrRoot')) {
    if (granted.has(candidate)) {
      return true;
    }
  }

  for (const grantedValue of granted) {
    if (grantedValue.endsWith(`.${normalizedRequired}`)) {
      return true;
    }
	}

	if (normalizedRequired.startsWith('app.') || normalizedRequired.startsWith('application.')) {
		for (const alias of ['owner', 'manage', 'edit', 'view', 'application.owner', 'application.manage', 'application.edit', 'application.view', 'app.owner', 'app.manage', 'app.edit', 'app.view']) {
			if (granted.has(alias)) {
				return true;
			}
		}
	}

	return false;
}


/**
 * Validates internal/external session credentials and returns authenticated account.
 */
async function resolveAuthenticatedAccount(input: { app: string; sid: string; skey: string }): Promise<ResolvedAuth | null> {
	const now = new Date();

	const externalSession = await prisma.authnSession.findFirst({
		where: {
			id: input.sid,
			loginType: externalLoginType(input.app),
		},
		select: {
			accountId: true,
			key: true,
			validTill: true,
		},
	});

	if (externalSession) {
		if (externalSession.key !== input.skey) {
			return null;
		}

		if (!externalSession.validTill || externalSession.validTill <= now) {
			return null;
		}

		return {
			accountId: externalSession.accountId,
			validTill: externalSession.validTill,
		};
	}

	const internalSession = await prisma.authnSession.findUnique({
		where: { id: input.sid },
		select: {
			accountId: true,
			key: true,
			validTill: true,
		},
	});

	if (!internalSession) {
		return null;
	}

	if (internalSession.key !== input.skey) {
		return null;
	}

	if (!internalSession.validTill || internalSession.validTill <= now) {
		return null;
	}

	return {
		accountId: internalSession.accountId,
		validTill: internalSession.validTill,
	};
}


/**
 * Resolves app assets and direct permission grants for a member account.
 */
async function resolvePermissionSet(input: {
	app: string;
	api: string;
	accountId: string;
	checkFor: string[];
}): Promise<{ permissions: string[]; matched: string[] }> {
	const appRecord = await prisma.application.findUnique({
		where: { id: input.app },
		select: { id: true },
	});

	if (!appRecord) {
		return { permissions: [], matched: [] };
	}
	const resolvedPermissions = new Set<string>();

	for (const grant of await prisma.access.findMany({
		where: {
			memberAccountId: input.accountId,
			accessApplicationId: input.app,
			...activeAccessWhere(),
		},
		select: { roleId: true, role: { select: { permissions: true } } },
	})) {
		resolvedPermissions.add(normalizePermission(grant.roleId));
		for (const permission of extractRolePermissionNames(grant.role.permissions)) {
			resolvedPermissions.add(normalizePermission(permission));
		}
	}

	const matched = input.checkFor.filter((permission) => hasPermission(resolvedPermissions, permission));
	return {
		permissions: Array.from(resolvedPermissions),
		matched,
	};
}


/**
 * Ensures actor can manage permission records for target account.
 */
async function canManagePermissions(actorAccountId: string, memberId: string, app: string, api: string): Promise<boolean> {
	if (actorAccountId === memberId) {
		return true;
	}

	const actorPermissions = await resolvePermissionSet({
		app,
		api,
		accountId: actorAccountId,
		checkFor: ['application.manage'],
	});

	const granted = new Set(actorPermissions.permissions.map(normalizePermission));
	return hasPermission(granted, 'application.manage') || hasPermission(granted, 'application.owner') || hasPermission(granted, 'app.manage') || hasPermission(granted, 'app.owner');
}


/**
 * Validates the session and checks whether the account can access the requested app or API.
 */
export async function checkPermission(input: CheckPermissionInput): Promise<PermissionCheckResult> {
	const app = input.app?.trim();
	const api = input.api?.trim();
	const sid = input.sid?.trim();
	const skey = input.skey?.trim();
	const requiredPermissions = normalizePermissionList(input.checkFor);
	const memberId = input.for_account?.trim() || '';

	if (!app || !sid || !skey) {
		return { status: 'invalid', reason: 'invalidSource' };
	}

	const now = new Date();

	try {
		const auth = await resolveAuthenticatedAccount({ app, sid, skey });
		if (!auth) {
			return { status: 'invalid', reason: 'invalidSource' };
		}

		const account = await prisma.account.findUnique({
			where: { id: auth.accountId },
			select: {
				id: true,
				status: true,
				details: true,
			},
		});

		if (!account) {
			return { status: 'invalid', reason: '404' };
		}

		const details = account.details as Record<string, unknown> | null;
		const block = (details?.block as BlockInfo) || null;

		if (account.status === 'blocked' && hasActiveBlock(block, now)) {
			return { status: 'invalid', reason: 'accountBlocked' };
		}

		const resolvedAccountId = memberId || account.id;
		const permissionSet = await resolvePermissionSet({
			app,
			api: api || '',
			accountId: resolvedAccountId,
			checkFor: requiredPermissions,
		});

		if (requiredPermissions.length > 0) {
			const granted = new Set(permissionSet.permissions.map(normalizePermission));
			const isAllowed = requiredPermissions.every((permission) => hasPermission(granted, permission));

			if (!isAllowed) {
				return {
					status: 'invalid',
					reason: 'forbidden',
					permissions: permissionSet.permissions,
					matched: permissionSet.matched,
				};
			}
		}

		return {
			status: 'valid',
			validTill: auth.validTill.toISOString(),
			permissions: permissionSet.permissions,
			matched: permissionSet.matched,
		};
	} catch (error) {
		await logError('database', error, `checkPermission:${app}:${sid}`);
		return { status: 'invalid', reason: '404' };
	}
}


/**
 * Replaces permission records for a target account within app/api scope.
 */
export async function updatePermission(input: UpdatePermissionInput): Promise<PermissionMutationResult> {
	const app = input.app?.trim();
	const api = input.api?.trim() || null;
	const sid = input.sid?.trim();
	const skey = input.skey?.trim();
	const memberId = input.for_account?.trim();
	const nextPermissions = normalizePermissionList(input.permissions || []);

	if (!app || !sid || !skey) {
		return { success: false, error: 'Missing auth source.' };
	}

	if (!memberId) {
		return { success: false, error: 'Missing for_account.' };
	}

	try {
		const auth = await resolveAuthenticatedAccount({ app, sid, skey });
		if (!auth) {
			return { success: false, error: 'Unauthorized.' };
		}

		const canManage = await canManagePermissions(auth.accountId, memberId, app, api || '');
		if (!canManage) {
			return { success: false, error: 'Forbidden.' };
		}

		return {
			success: false,
			error: 'Direct permission mutation is deprecated. Assign portfolio roles for accountId + assetType + assetId.',
			permissions: nextPermissions,
		};
	} catch (error) {
		await logError('database', error, `updatePermission:${app}:${memberId}`);
		return { success: false, error: 'Failed to update permission.' };
	}
}


/**
 * Revokes one or more permissions for a target account within app/api scope.
 */
export async function revokePermission(input: RevokePermissionInput): Promise<PermissionMutationResult> {
	const app = input.app?.trim();
	const api = input.api?.trim() || null;
	const sid = input.sid?.trim();
	const skey = input.skey?.trim();
	const memberId = input.for_account?.trim();
	const toRevoke = normalizePermissionList(input.permissions || []);

	if (!app || !sid || !skey) {
		return { success: false, error: 'Missing auth source.' };
	}

	if (!memberId) {
		return { success: false, error: 'Missing for_account.' };
	}

	if (toRevoke.length === 0) {
		return { success: true, permissions: [] };
	}

	try {
		const auth = await resolveAuthenticatedAccount({ app, sid, skey });
		if (!auth) {
			return { success: false, error: 'Unauthorized.' };
		}

		const canManage = await canManagePermissions(auth.accountId, memberId, app, api || '');
		if (!canManage) {
			return { success: false, error: 'Forbidden.' };
		}

		return {
			success: false,
			error: 'Direct permission revocation is deprecated. Remove portfolio roles for accountId + assetType + assetId.',
			permissions: toRevoke,
		};
	} catch (error) {
		await logError('database', error, `revokePermission:${app}:${memberId}`);
		return { success: false, error: 'Failed to revoke permission.' };
	}
}
