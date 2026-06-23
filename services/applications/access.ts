'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import {
  canAssignRoleScopeToAccount,
  expectedRoleScopesForAccount,
  isSelfRequestableRoleAcquisitionType,
  roleApprovalRequiresRequest,
} from '@/services/role-scopes';
import { revalidateApplicationRequestsRoutes } from '@/services/applications/revalidate-routes';

const manageApplicationSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  permissions: z.array(z.string().min(1)).default([]),
});

export type UserApplicationAccess = {
  id: string;
  name: string;
  description: string;
  website?: string;
  connectionType: 'internal' | 'external' | 'both';
  permissions: string[];
  connectedOn: Date;
};

const INTERNAL_APP_PREFIX = 'neup.';
function isInternalApp(appId: string) {
  return appId.startsWith(INTERNAL_APP_PREFIX);
}

export type AssignOwnApplicationRoleResult =
  | { success: true; mode: 'assigned'; appId: string; roleId: string; roleName: string; scope: string }
  | { success: true; mode: 'requested'; appId: string; roleId: string; roleName: string; scope: string; requestId: string }
  | { success: false; error: string };

export async function assignOwnApplicationRole(input: {
  accountId: string;
  appId: string;
  roleReference: string;
  requestSource?: string;
}): Promise<AssignOwnApplicationRoleResult> {
  const accountId = input.accountId?.trim();
  const appId = input.appId?.trim();
  const roleReference = input.roleReference?.trim();

  if (!accountId || !appId || !roleReference) {
    return { success: false, error: 'Account ID, application ID, and role are required.' };
  }

  try {
    const [account, application, role] = await Promise.all([
      prisma.account.findUnique({
        where: { id: accountId },
        select: { accountType: true },
      }),
      prisma.application.findUnique({
        where: { id: appId },
        select: { id: true, name: true },
      }),
      prisma.authzRole.findFirst({
        where: {
          appId,
          OR: [{ id: roleReference }, { name: roleReference }],
        },
        select: { id: true, name: true, scope: true, acquisitionType: true, approvalPolicy: true },
      }),
    ]);

    if (!account) return { success: false, error: 'Account not found.' };
    if (!application) return { success: false, error: 'Application not found.' };
    if (!role) return { success: false, error: 'Role not found for this application.' };

    const canSelfRequest = isSelfRequestableRoleAcquisitionType(role.acquisitionType) &&
      canAssignRoleScopeToAccount(role.scope, account.accountType, ['public']);
    const canAssignImmediately = canSelfRequest && !roleApprovalRequiresRequest(role.approvalPolicy);
    const requiresApproval = canSelfRequest && roleApprovalRequiresRequest(role.approvalPolicy);

    if (!canAssignImmediately && !requiresApproval) {
      return { success: false, error: 'This role scope cannot be requested by this account type.' };
    }

    const connectionDetails = await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      const defaultRoleId = await getApplicationDefaultRoleId(appId);
      const existingConnection = await tx.connection.findUnique({
        where: { accountId_appId: { accountId, appId } },
        select: { id: true },
      });
      const connection = existingConnection
        ? existingConnection
        : await tx.connection.create({
            data: { accountId, appId, status: 'active', roleId: defaultRoleId },
            select: { id: true },
          });

      if (canAssignImmediately) {
        const publicScopes = expectedRoleScopesForAccount(account.accountType, 'public');
        if (publicScopes.length > 0) {
          await tx.access.deleteMany({
            where: {
              memberAccountId: accountId,
              parentAccountId: accountId,
              assetApplicationId: appId,
              role: { scope: { in: publicScopes } },
            },
          });
        }

        await ensureAccessGrant(tx, {
          memberAccountId: accountId,
          parentAccountId: accountId,
          childApplicationId: appId,
          accessApplicationId: appId,
          roleId: role.id,
          details: {
            connectionId: connection.id,
            source: input.requestSource ?? 'assignOwnApplicationRole',
          },
        });

        return { connectionId: connection.id, requestId: null as string | null };
      }

      const ownerGrant = await tx.access.findFirst({
        where: {
          assetApplicationId: appId,
          roleId: 'application.owner',
          status: 'active',
        },
        select: { memberAccountId: true },
      });

      const request = await tx.request.create({
        data: {
          senderId: accountId,
          recipientId: ownerGrant?.memberAccountId ?? accountId,
          action: 'applicationRoleRequest',
          type: 'applicationRoleRequest',
          data: {
            appId,
            appName: application.name,
            accountId,
            connectionId: connection.id,
            roleIds: [role.id],
            roles: [{ id: role.id, name: role.name, scope: role.scope }],
            assignmentKind: 'publicApplicationAccess',
            requestSource: input.requestSource ?? 'assignOwnApplicationRole',
          },
        },
        select: { id: true },
      });

      return { connectionId: connection.id, requestId: request.id };
    });

    revalidatePath('/data/appconnection');
    revalidatePath(`/data/appconnection/${appId}`);
    revalidateApplicationRequestsRoutes(appId);

    if (canAssignImmediately) {
      await dispatchAccountUpdatedEvent({ accountId, changedFields: ['role'] });
      return {
        success: true,
        mode: 'assigned',
        appId,
        roleId: role.id,
        roleName: role.name,
        scope: role.scope,
      };
    }

    return {
      success: true,
      mode: 'requested',
      appId,
      roleId: role.id,
      roleName: role.name,
      scope: role.scope,
      requestId: connectionDetails.requestId!,
    };
  } catch (error) {
    await logError('database', error, `assignOwnApplicationRole:${accountId}:${appId}:${roleReference}`);
    return { success: false, error: 'Failed to assign application role.' };
  }
}

export async function getUserApplicationAccess(appId: string): Promise<UserApplicationAccess | null> {
  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return null;
  }

  try {
    const [application, connection, roleRows] = await Promise.all([
      prisma.application.findUnique({ where: { id: appId } }),
      prisma.connection.findUnique({
        where: {
          accountId_appId: { accountId, appId },
        },
        select: { connectedAt: true },
      }),
      prisma.access.findMany({
        where: {
          memberAccountId: accountId,
          parentAccountId: accountId,
          assetApplicationId: appId,
          status: 'active',
          OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        },
        select: { roleId: true },
      }),
    ]);

    if (!application || !connection) {
      return null;
    }

    const connectionType: UserApplicationAccess['connectionType'] = isInternalApp(appId) ? 'internal' : 'external';
    const permissions = Array.from(new Set(roleRows.map((r) => r.roleId)));
    const connectedOn = connection.connectedAt;

    return {
      id: application.id,
      name: application.name,
      description: application.description || '',
      website: application.website || undefined,
      connectionType,
      permissions,
      connectedOn,
    };
  } catch (error) {
    await logError('database', error, `getUserApplicationAccess:${appId}`);
    return null;
  }
}

export async function addUserApplicationAccess(input: { appId: string; permissions: string[] }) {
  const parsed = manageApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application input.' };
  }

  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const { appId, permissions } = parsed.data;

  try {
    const application = await prisma.application.findUnique({ where: { id: appId }, select: { id: true } });
    if (!application) return { success: false, error: 'Application not found.' };

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { accountType: true },
    });
    if (!account) return { success: false, error: 'Account not found.' };

    const selectedRoles = permissions.length
      ? await prisma.authzRole.findMany({
          where: { id: { in: permissions }, appId },
          select: { id: true, name: true, scope: true, acquisitionType: true, approvalPolicy: true },
        })
      : [];
    if (selectedRoles.length !== permissions.length) {
      return { success: false, error: 'One or more roles were not found for this application.' };
    }

    const requestableRoles = selectedRoles.filter((role) =>
      isSelfRequestableRoleAcquisitionType(role.acquisitionType) &&
      canAssignRoleScopeToAccount(role.scope, account.accountType, ['public']),
    );
    const immediateRoles = requestableRoles.filter((role) => !roleApprovalRequiresRequest(role.approvalPolicy));
    const approvalRoles = requestableRoles.filter((role) => roleApprovalRequiresRequest(role.approvalPolicy));
    if (requestableRoles.length !== selectedRoles.length) {
      return { success: false, error: 'One or more roles cannot be requested by this account type.' };
    }

    await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      const existingConnection = await tx.connection.findUnique({
        where: { accountId_appId: { accountId, appId } },
        select: { id: true },
      });

      const defaultRoleId = await getApplicationDefaultRoleId(appId);
      const connection = existingConnection
        ? existingConnection
        : await tx.connection.create({
            data: { accountId, appId, status: 'active', roleId: defaultRoleId },
          });

      if (!existingConnection) {
        await logActivity(
          accountId,
          activityAction.accountConnectionCreate(connection.id, appId),
          'Success'
        );
      }

      const publicScopes = expectedRoleScopesForAccount(account.accountType, 'public');
      if (publicScopes.length > 0) {
        await tx.access.deleteMany({
          where: {
            memberAccountId: accountId,
            parentAccountId: accountId,
            assetApplicationId: appId,
            role: { scope: { in: publicScopes } },
          },
        });
      }

      if (immediateRoles.length > 0) {
        for (const role of immediateRoles) {
          await ensureAccessGrant(tx, {
            memberAccountId: accountId,
            parentAccountId: accountId,
            childApplicationId: appId,
            accessApplicationId: appId,
            roleId: role.id,
            details: {
              connectionId: connection.id,
            },
          });
        }
      }

      if (approvalRoles.length > 0) {
        const ownerGrant = await tx.access.findFirst({
          where: {
            assetApplicationId: appId,
            roleId: 'application.owner',
            status: 'active',
          },
          select: { memberAccountId: true },
        });
        await tx.request.create({
          data: {
            senderId: accountId,
            recipientId: ownerGrant?.memberAccountId ?? accountId,
            action: 'applicationRoleRequest',
            type: 'applicationRoleRequest',
            data: {
              appId,
              accountId,
              connectionId: connection.id,
              roleIds: approvalRoles.map((role) => role.id),
              roles: approvalRoles.map((role) => ({ id: role.id, name: role.name, scope: role.scope })),
              assignmentKind: 'publicApplicationAccess',
            },
          },
        });
      }
    });

    revalidatePath('/data/appconnection');
    revalidatePath(`/data/appconnection/${appId}`);
    revalidatePath(`/data/appconnection/${appId}/edit`);

    return { success: true, appId };
  } catch (error) {
    await logError('database', error, `addUserApplicationAccess:${appId}`);
    return { success: false, error: 'Failed to add application access.' };
  }
}

export async function updateUserApplicationPermissions(input: { appId: string; permissions: string[] }) {
  const parsed = manageApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application input.' };
  }

  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const { appId, permissions } = parsed.data;

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { accountType: true },
    });
    if (!account) return { success: false, error: 'Account not found.' };

    const selectedRoles = permissions.length
      ? await prisma.authzRole.findMany({
          where: { id: { in: permissions }, appId },
          select: { id: true, name: true, scope: true, acquisitionType: true, approvalPolicy: true },
        })
      : [];
    if (selectedRoles.length !== permissions.length) {
      return { success: false, error: 'One or more roles were not found for this application.' };
    }

    const requestableRoles = selectedRoles.filter((role) =>
      isSelfRequestableRoleAcquisitionType(role.acquisitionType) &&
      canAssignRoleScopeToAccount(role.scope, account.accountType, ['public']),
    );
    const immediateRoles = requestableRoles.filter((role) => !roleApprovalRequiresRequest(role.approvalPolicy));
    const approvalRoles = requestableRoles.filter((role) => roleApprovalRequiresRequest(role.approvalPolicy));
    if (requestableRoles.length !== selectedRoles.length) {
      return { success: false, error: 'One or more roles cannot be requested by this account type.' };
    }

    await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      const publicScopes = expectedRoleScopesForAccount(account.accountType, 'public');
      if (publicScopes.length > 0) {
        await tx.access.deleteMany({
          where: {
            memberAccountId: accountId,
            parentAccountId: accountId,
            assetApplicationId: appId,
            role: { scope: { in: publicScopes } },
          },
        });
      }

      if (immediateRoles.length > 0) {
        const connection = await tx.connection.findUnique({
          where: { accountId_appId: { accountId, appId } },
          select: { id: true },
        });

        for (const role of immediateRoles) {
          await ensureAccessGrant(tx, {
            memberAccountId: accountId,
            parentAccountId: accountId,
            childApplicationId: appId,
            accessApplicationId: appId,
            roleId: role.id,
            details: {
              connectionId: connection?.id ?? null,
            },
          });
        }
      }

      if (approvalRoles.length > 0) {
        const connection = await tx.connection.findUnique({
          where: { accountId_appId: { accountId, appId } },
          select: { id: true },
        });
        const ownerGrant = await tx.access.findFirst({
          where: {
            assetApplicationId: appId,
            roleId: 'application.owner',
            status: 'active',
          },
          select: { memberAccountId: true },
        });
        await tx.request.create({
          data: {
            senderId: accountId,
            recipientId: ownerGrant?.memberAccountId ?? accountId,
            action: 'applicationRoleRequest',
            type: 'applicationRoleRequest',
            data: {
              appId,
              accountId,
              connectionId: connection?.id ?? null,
              roleIds: approvalRoles.map((role) => role.id),
              roles: approvalRoles.map((role) => ({ id: role.id, name: role.name, scope: role.scope })),
              assignmentKind: 'publicApplicationAccess',
            },
          },
        });
      }
    });

    revalidatePath('/data/appconnection');
    revalidatePath(`/data/appconnection/${appId}`);
    revalidatePath(`/data/appconnection/${appId}/edit`);

    return { success: true, appId };
  } catch (error) {
    await logError('database', error, `updateUserApplicationPermissions:${appId}`);
    return { success: false, error: 'Failed to update permissions.' };
  }
}
