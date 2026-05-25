// @ts-nocheck
'use server';

import prisma from '@/core/helpers/prisma';
import { Prisma } from '../../prisma/generated/client/client';
import { getUserNeupIds, getUserProfile as fetchUserProfile, checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { z } from 'zod';
import { createNotification } from '../notifications';
import { setSessionCookies } from '@/core/helpers/cookies';
import { warningReasons } from '@/app/(manage)/manage/[id]/forms';
import type { UserProfile } from '@/services/user';


// --- Types ---

export type UserDetails = {
  accountId: string;
  neupId: string;
  profile: UserProfile;
  accountType?: string;
};

export type UserActivityLog = {
    id: string;
    action: string;
    status: string;
    ip: string;
    timestamp: string;
    geolocation?: string;
    rawTimestamp: Date;
};

export type UserPermissions = {
    assignedPermissions: string[];
    restrictedPermissions: string[];
    allPermissions: string[];
};

export type UserDashboardStats = {
    lastIpAddress: string;
    lastLocation: string;
    lastActive: string;
};

export type AccountDetails = {
    block: {
        status: boolean;
        reason?: string;
        message?: string;
        is_permanent?: boolean;
        until?: string | null;
    } | null;
};

export type UserDetailsLimited = {
  accountId: string;
  neupId: string;
  nameDisplay: string;
};


// --- Read ---

// Returns the full profile and account type for a given account ID.
export async function getUserDetails(accountId: string): Promise<UserDetails | null> {
  const profile = await fetchUserProfile(accountId);
  if (!profile) return null;
  return {
    accountId,
    neupId: profile.neupIdPrimary || 'N/A',
    profile,
    accountType: profile.accountType || 'individual',
  };
}

// Returns block status and other details from the account's JSON details field.
export async function getAccountDetails(accountId: string) {
    const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { details: true },
    });
    if (!account) return null;
    const details = account.details as Record<string, unknown> | null;
    return { block: (details?.block as AccountDetails['block']) || null };
}

// Returns the last 20 activity log entries for an account.
export async function getActivity(accountId: string): Promise<UserActivityLog[]> {
    const rows = await prisma.activity.findMany({
        where: { memberId: accountId },
        orderBy: { timestamp: 'desc' },
        take: 20,
    });
    return rows.map(row => ({
        id: row.id,
        action: row.action,
        status: row.status,
        ip: row.ip,
        timestamp: new Date(row.timestamp).toLocaleString(),
        geolocation: row.geolocation || undefined,
        rawTimestamp: new Date(row.timestamp),
    }));
}

// Returns the last activity stats (IP, location, active time) for an account.
export async function getUserDashboardStats(accountId: string): Promise<UserDashboardStats> {
    const last = await prisma.activity.findFirst({
        where: { memberId: accountId },
        orderBy: { timestamp: 'desc' },
    });
    if (!last) return { lastIpAddress: 'N/A', lastLocation: 'N/A', lastActive: 'N/A' };
    return {
        lastIpAddress: last.ip,
        lastLocation: last.geolocation || 'N/A',
        lastActive: new Date(last.timestamp).toLocaleString(),
    };
}

// Returns the resolved permission and restriction sets for an account.
// Reads from authzAccountAccessGrant + authzRolePermission — the same path as checkPermissions().
export async function getPermissions(accountId: string): Promise<UserPermissions> {
    const { getAccountPermission } = await import('@/services/user');
    const allPermissions = await getAccountPermission(accountId);
    return {
        assignedPermissions: allPermissions,
        restrictedPermissions: [],
        allPermissions,
    };
}

// Returns the roles currently assigned to an account (self-grants).
export async function getAccountRoles(accountId: string): Promise<{ id: string; name: string; description: string | null }[]> {
    try {
        const grants = await prisma.authzAccountAccessGrant.findMany({
            where: {
                accessTo: accountId,
                memberId: accountId,
                appId: 'neup.account',
            },
            select: {
                role: { select: { id: true, name: true, description: true } },
            },
        });
        const seen = new Set<string>();
        return grants
            .map((g) => g.role)
            .filter((r) => {
                if (seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
            });
    } catch (error) {
        await logError('database', error, `getAccountRoles:${accountId}`);
        return [];
    }
}

// Returns all roles available for assignment (scoped to neup.account, excluding per-account custom roles).
export async function getAvailableRoles(): Promise<{ id: string; name: string; description: string | null }[]> {
    try {
        const roles = await prisma.authzRole.findMany({
            where: {
                appId: 'neup.account',
                NOT: { id: { startsWith: 'account.custom.' } },
            },
            select: { id: true, name: true, description: true },
            orderBy: { name: 'asc' },
        });
        return roles;
    } catch (error) {
        await logError('database', error, 'getAvailableRoles');
        return [];
    }
}

// Replaces the role assignments for an account with the given set of role IDs.
// Removes all existing self-grants and creates new ones for each selected role.
export async function updateAccountRoles(accountId: string, roleIds: string[]): Promise<{ success: boolean; error?: string }> {
    const canUpdate = await checkPermissions(['root.permission.edit']);
    if (!canUpdate) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        await prisma.$transaction(async (tx) => {
            // Remove all existing self-grants for this account
            await tx.authzAccountAccessGrant.deleteMany({
                where: {
                    accessTo: accountId,
                    memberId: accountId,
                    appId: 'neup.account',
                },
            });

            // Create new grants for each selected role
            if (roleIds.length > 0) {
                await tx.authzAccountAccessGrant.createMany({
                    data: roleIds.map((roleId) => ({
                        accessTo: accountId,
                        memberId: accountId,
                        roleId,
                        appId: 'neup.account',
                    })),
                });
            }
        });

        await logActivity(accountId, `Roles updated by admin ${adminId}: [${roleIds.join(', ')}]`, 'Success', undefined, adminId);
        revalidatePath(`/manage/${accountId}/permissions`);
        return { success: true };
    } catch (error) {
        await logError('database', error, `updateAccountRoles:${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


// --- Write ---

// Updates the permission set for an account by writing to authzAccountAccessGrant + authzRolePermission.
// Uses a per-account custom role so the result is immediately visible to checkPermissions().
export async function updateUserPermissions(accountId: string, newPermissionIds: string[], newRestrictionIds: string[]): Promise<{ success: boolean; error?: string }> {
    const canUpdate = await checkPermissions(['root.permission.edit']);
    if (!canUpdate) return { success: false, error: 'Permission denied.' };

    try {
        const roleId = `account.custom.${accountId}`;

        // Upsert the custom role
        await prisma.authzRole.upsert({
            where: { id: roleId },
            update: { name: roleId, scope: 'account', appId: 'neup.account' },
            create: { id: roleId, name: roleId, scope: 'account', appId: 'neup.account' },
        });

        // Effective permissions = assigned minus restricted
        const effectivePermissions = newPermissionIds.filter(p => !newRestrictionIds.includes(p));

        // Upsert the role-permission map with the denormalized permission array
        const mapId = `${roleId}::permissions`;
        if (effectivePermissions.length > 0) {
            await prisma.authzRolePermission.upsert({
                where: { id: mapId },
                update: { roleId, appId: 'neup.account', roleName: roleId, denormalizedPermission: effectivePermissions },
                create: { id: mapId, roleId, permissionId: effectivePermissions[0], appId: 'neup.account', roleName: roleId, denormalizedPermission: effectivePermissions },
            });
        } else {
            await prisma.authzRolePermission.deleteMany({ where: { roleId } });
        }

        // Upsert the grant linking the account to its custom role
        const existingGrant = await prisma.authzAccountAccessGrant.findFirst({
            where: { accessTo: accountId, memberId: accountId, roleId, appId: 'neup.account' },
        });
        if (!existingGrant) {
            await prisma.authzAccountAccessGrant.create({
                data: { accessTo: accountId, memberId: accountId, roleId, appId: 'neup.account' },
            });
        }

        const adminId = await getPersonalAccountId() ?? '';
        await logActivity(accountId, `Permissions updated by root user ${adminId}`, 'Success', undefined, adminId);
        revalidatePath(`/manage/${accountId}/permissions`);
        return { success: true };
    } catch (e) {
        await logError('database', e, `updateUserPermissions: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


// --- Admin Actions ---

const sendWarningSchema = z.object({
    reasonKey: z.nativeEnum(warningReasons),
    source: z.string().optional(),
    remarks: z.string().min(1, 'Remarks are required.'),
    noticeType: z.enum(['general', 'success', 'warning', 'error']),
    persistence: z.enum(['dismissable', 'untildays', 'permanent']),
    days: z.number().optional(),
});

// Sends a sticky warning notification to a user's account.
export async function sendWarning(userId: string, data: z.infer<typeof sendWarningSchema>): Promise<{ success: boolean; error?: string }> {
    const canWarn = await checkPermissions(['root.account.send_warning']);
    if (!canWarn) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    const validation = sendWarningSchema.safeParse(data);
    if (!validation.success) return { success: false, error: 'Invalid data submitted.' };

    const { reasonKey, source, remarks, noticeType, persistence, days } = validation.data;

    let expiresOn: Date | null = null;
    if (persistence === 'untildays' && days) {
        expiresOn = new Date();
        expiresOn.setDate(expiresOn.getDate() + days);
    }

    const actionTypeMap = { general: 'information.sticky', success: 'success.sticky', warning: 'warning.sticky', error: 'danger.sticky' };
    const reasonText = warningReasons[reasonKey as keyof typeof warningReasons];
    const message = `Your account has received a warning for: <strong>${reasonText}</strong>. Please review our community guidelines.`;

    try {
        await createNotification({
            recipient_id: userId,
            action: actionTypeMap[noticeType],
            message,
            persistence,
            noticeType,
            reason: remarks,
            expiresOn: expiresOn || undefined,
            sender_id: adminId,
        });
        await logActivity(userId, `Admin sent warning for ${reasonText}`, 'Alert', undefined, adminId);
        return { success: true };
    } catch (error) {
        await logError('database', error, 'sendWarning');
        return { success: false, error: 'Could not send warning.' };
    }
}

const blockReasons = {
    security_risk: { reason: 'Compromised Account / Security Risk', message: 'Your account has been temporarily blocked due to a potential security risk.' },
    payment_issue: { reason: 'Payment or Billing Issue', message: 'Your account access has been blocked due to a payment or billing issue. Please contact support.' },
    tos_repeated: { reason: 'Repeated Terms of Service Violations', message: 'Your account has been blocked due to repeated violations of our Terms of Service.' },
    illegal_activity: { reason: 'Illegal Activity', message: 'Your account has been permanently blocked due to illegal activity.' },
    other: { reason: 'Other Policy Violation', message: 'Your account has been blocked for violating our policies. Please contact support for more information.' },
} as const;

const blockServiceSchema = z.object({
    reasonKey: z.enum(['security_risk', 'payment_issue', 'tos_repeated', 'illegal_activity', 'other'] as const),
    isPermanent: z.boolean(),
    durationInHours: z.number().optional(),
    source: z.string().optional(),
    remarks: z.string().min(1, 'Remarks are required'),
});

// Blocks an account's service access and records the reason.
export async function blockServiceAccess(userId: string, data: z.infer<typeof blockServiceSchema>): Promise<{ success: boolean; error?: string }> {
    const canBlock = await checkPermissions(['root.account.give_block_account']);
    if (!canBlock) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    const validation = blockServiceSchema.safeParse(data);
    if (!validation.success) return { success: false, error: 'Invalid data submitted.' };

    const { isPermanent, durationInHours, reasonKey, source, remarks } = validation.data;
    const { reason, message } = blockReasons[reasonKey];

    try {
        let until = null;
        if (!isPermanent && durationInHours) {
            const date = new Date();
            date.setHours(date.getHours() + durationInHours);
            until = date;
        }

        const blockData = {
            status: true, reason, message,
            is_permanent: isPermanent,
            until: until ? until.toISOString() : null,
            source: source || null, remarks,
            blockedBy: adminId,
            blockedOn: new Date().toISOString(),
        };

        const existingAccount = await prisma.account.findUnique({ where: { id: userId }, select: { details: true } });
        const existingDetails = (existingAccount?.details && typeof existingAccount.details === 'object' && !Array.isArray(existingAccount.details))
            ? (existingAccount.details as Record<string, unknown>) : {};

        await prisma.$transaction([
            prisma.account.update({
                where: { id: userId },
                data: { details: { ...existingDetails, block: blockData } as Prisma.InputJsonValue, status: 'blocked' },
            }),
            prisma.activity.create({
                data: {
                    memberId: userId, actorAccountId: adminId,
                    action: `Account status changed to blocked. Reason: ${reason}. ${remarks}`,
                    status: 'Alert', ip: 'system', timestamp: new Date(),
                    geolocation: `Request by admin: ${adminId}.`,
                },
            }),
        ]);

        await logActivity(userId, `Service access blocked. Reason: ${reason}`, 'Alert', undefined, adminId);
        await createNotification({ recipient_id: userId, action: 'danger.sticky', message, persistence: 'permanent', noticeType: 'error', sender_id: adminId });
        return { success: true };
    } catch (error) {
        await logError('database', error, 'blockServiceAccess');
        return { success: false, error: 'Could not block service access.' };
    }
}

// Removes a block from an account and restores active status.
export async function unblockServiceAccess(userId: string): Promise<{ success: boolean; error?: string }> {
    const canUnblock = await checkPermissions(['root.account.remove_block_account']);
    if (!canUnblock) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        const existingAccount = await prisma.account.findUnique({ where: { id: userId }, select: { details: true } });
        const existingDetails = (existingAccount?.details && typeof existingAccount.details === 'object' && !Array.isArray(existingAccount.details))
            ? { ...(existingAccount.details as Record<string, unknown>) } : {};

        delete existingDetails.block;
        const nextDetails: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
            Object.keys(existingDetails).length > 0 ? (existingDetails as Prisma.InputJsonValue) : Prisma.DbNull;

        await prisma.$transaction([
            prisma.account.update({ where: { id: userId }, data: { details: nextDetails, status: 'active' } }),
            prisma.activity.create({
                data: {
                    memberId: userId, actorAccountId: adminId,
                    action: 'Account status changed to active. Service access restored by admin.',
                    status: 'Success', ip: 'system', timestamp: new Date(),
                    geolocation: `Request by admin: ${adminId}.`,
                },
            }),
        ]);

        await logActivity(userId, 'Service access unblocked', 'Success', undefined, adminId);
        await createNotification({ recipient_id: userId, action: 'informative.unblock', message: 'Your account access has been restored.', sender_id: adminId });
        return { success: true };
    } catch (error) {
        await logError('database', error, 'unblockServiceAccess');
        return { success: false, error: 'Could not unblock service access.' };
    }
}

// Creates an impersonation session for an admin to operate as another user.
export async function impersonateUser(userId: string, neupId: string): Promise<{ success: boolean; error?: string }> {
    const canImpersonate = await checkPermissions(['root.account.impersonate']);
    if (!canImpersonate) return { success: false, error: 'Permission denied.' };

    const allowedDeviceTypes = ['web', 'api', 'android', 'ios', 'windowsapp'];
    const headersList = await headers();
    const deviceTypeHeader = headersList.get('x-device-type');
    if (!deviceTypeHeader || !allowedDeviceTypes.includes(deviceTypeHeader)) {
        return { success: false, error: 'Invalid or missing device type.' };
    }

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        const ipAddress = headersList.get('x-forwarded-for') || 'Unknown IP';
        const userAgent = headersList.get('user-agent') || 'Unknown User-Agent';
        const validTill = new Date();
        validTill.setDate(validTill.getDate() + 7);
        const sessionKey = crypto.randomUUID();

        const newSession = await prisma.authnSession.create({
            data: { accountId: userId, key: sessionKey, ipAddress, userAgent, validTill, lastLoggedIn: new Date(), loginType: 'Impersonation', deviceType: deviceTypeHeader },
        });

        await setSessionCookies({ aid: userId, sid: newSession.id, skey: sessionKey, accountId: userId, sessionId: newSession.id, sessionKey }, validTill);
        await logActivity(userId, `Admin impersonation started by ${adminId}`, 'Alert', undefined, adminId);
        await createNotification({ recipient_id: userId, action: 'warning.sticky', message: 'Your account was inspected by a superuser.', persistence: 'permanent', noticeType: 'warning', sender_id: adminId });
        return { success: true };
    } catch (error) {
        await logError('database', error, `impersonateUser: ${userId}`);
        return { success: false, error: 'Could not start impersonation session.' };
    }
}

// Permanently deletes an account and all associated data.
export async function deleteUserAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    const canDelete = await checkPermissions(['root.account.delete']);
    if (!canDelete) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        await prisma.$transaction([
            prisma.neupId.deleteMany({ where: { accountId: userId } }),
            prisma.contact.deleteMany({ where: { accountId: userId } }),
            prisma.permit.deleteMany({ where: { OR: [{ accountId: userId }, { memberId: userId }] } }),
            prisma.authnSession.deleteMany({ where: { accountId: userId } }),
            prisma.activity.deleteMany({ where: { OR: [{ memberId: userId }, { actorAccountId: userId }] } }),
            prisma.notification.deleteMany({ where: { accountId: userId } }),
            prisma.verification.deleteMany({ where: { accountId: userId } }),
            prisma.authnMethod.deleteMany({ where: { accountId: userId } }),
            // Mark all app connections as deleted before the cascade removes them.
            // This allows any in-flight reads (e.g. webhooks) to observe the tombstone.
            prisma.connection.updateMany({
                where: { accountId: userId },
                data: { status: 'deleted' },
            }),
            prisma.account.delete({ where: { id: userId } }),
        ]);

        await logActivity(userId, `Account permanently deleted by admin ${adminId}`, 'Alert', undefined, adminId);
        return { success: true };
    } catch (error) {
        await logError('database', error, `deleteUserAccount: ${userId}`);
        return { success: false, error: 'An unexpected error occurred during account deletion.' };
    }
}

// Sets or removes Neup.Pro status on an account.
export async function setProStatus(accountId: string, isPro: boolean, reason: string): Promise<{ success: boolean; error?: string }> {
    const canModify = await checkPermissions(['root.account.edit_pro_status']);
    if (!canModify) return { success: false, error: 'Permission denied.' };

    const adminId = await getPersonalAccountId();
    if (!adminId) return { success: false, error: 'Administrator not authenticated.' };

    try {
        const existingAccount = await prisma.account.findUnique({ where: { id: accountId }, select: { details: true } });
        const existingDetails = (existingAccount?.details && typeof existingAccount.details === 'object' && !Array.isArray(existingAccount.details))
            ? (existingAccount.details as Record<string, unknown>) : {};

        await prisma.account.update({
            where: { id: accountId },
            data: { details: { ...existingDetails, pro: isPro } as Prisma.InputJsonValue },
        });

        const action = isPro ? 'Activated Neup.Pro' : 'Deactivated Neup.Pro';
        await logActivity(accountId, `${action} by admin. Reason: ${reason}`, 'Success', undefined, adminId);
        await createNotification({
            recipient_id: accountId,
            action: isPro ? 'success.sticky' : 'warning.sticky',
            message: `Your Neup.Pro status has been ${isPro ? 'activated' : 'deactivated'} by an administrator.`,
            persistence: 'dismissable',
            noticeType: isPro ? 'success' : 'warning',
            sender_id: adminId,
        });
        return { success: true };
    } catch (e) {
        await logError('database', e, `setProStatus: ${accountId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}
