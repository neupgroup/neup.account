'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/logica/account/verify';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import { roleApprovalRequiresRequest } from '@/services/role-scopes';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { canCurrentAccountManageApplicationRoles, hasRootApplicationPermission } from '@/services/applications/manage';
import { revalidateApplicationRequestsRoutes, revalidateApplicationUsersRoutes } from '@/services/applications/revalidate-routes';
import { ROOT_APPLICATION_ROLES_MANAGE_PERMISSION } from '@/services/applications/permission-definitions';
import { roleMatchesAssignmentModesPolicy } from '@/services/applications/authz-scope-policy';
import { permission } from '@/logica/permission';

const servicePermissions = [
  permission('root.requests.manage', 'for_individual', 'service'),
];

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function approveApplicationRoleRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const actorAccountId = await getActiveAccountId();
  if (!actorAccountId) return { success: false, error: 'Not signed in.' };

  const [canRootEdit, canManageRequests] = await Promise.all([
    hasRootApplicationPermission(ROOT_APPLICATION_ROLES_MANAGE_PERMISSION),
    checkPermissions(['root.requests.manage']),
  ]);

  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, data: true, recipientId: true },
    });
    if (!request) return { success: false, error: 'Request not found.' };
    if (request.status !== 'pending') return { success: false, error: 'Request is not pending.' };

    const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
    const appId = typeof data.appId === 'string' ? data.appId : '';
    const accountId = typeof data.accountId === 'string' ? data.accountId : '';
    const connectionId = typeof data.connectionId === 'string' ? data.connectionId : '';
    const assignmentKind = typeof data.assignmentKind === 'string' ? data.assignmentKind : '';
    const requestTarget = typeof data.requestTarget === 'string' ? data.requestTarget : 'admin';
    const roleIds = stringList(data.roleIds);
    const canManageAppRoles = appId ? await canCurrentAccountManageApplicationRoles(appId) : false;
    const canApprove =
      (canRootEdit && canManageRequests) ||
      (requestTarget === 'owner' ? request.recipientId === actorAccountId : canManageAppRoles);
    if (!canApprove) return { success: false, error: 'Permission denied.' };

    if (!appId || !accountId || roleIds.length === 0) {
      return { success: false, error: 'Request payload is missing role assignment details.' };
    }

    const [account, roles] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { accountType: true } }),
      prisma.authzRole.findMany({
        where: { id: { in: roleIds }, appId },
        select: { id: true, scopeFor: true, scopeLevel: true, approvalPolicy: true },
      }),
    ]);
    if (!account) return { success: false, error: 'Target account not found.' };
    if (roles.length !== roleIds.length) return { success: false, error: 'One or more requested roles were not found.' };

    if (assignmentKind === 'connectionRole') {
      const connection = await prisma.connection.findFirst({
        where: { id: connectionId, appId, accountId },
        select: { id: true },
      });
      if (!connection) return { success: false, error: 'Connection not found.' };

      const invalidRole = roles.find((role) =>
        !roleApprovalRequiresRequest(role.approvalPolicy) ||
        !roleMatchesAssignmentModesPolicy({
          accountType: account.accountType,
          scopeFor: role.scopeFor,
          scopeLevel: role.scopeLevel,
          modes: ['public'],
        }),
      );
      if (invalidRole) {
        return { success: false, error: 'One or more requested role scopes are not approvable for this account type.' };
      }

      await prisma.$transaction(async (tx) => {
        await cleanupExpiredAccessModel(tx);

        for (const role of roles) {
          await ensureAccessGrant(tx, {
            memberAccountId: accountId,
            parentAccountId: accountId,
            childApplicationId: appId,
            accessApplicationId: appId,
            roleId: role.id,
            details: {
              connectionId: connection.id,
              approvedBy: actorAccountId,
              approvedRequestId: requestId,
            },
          });
        }

        await tx.request.update({
          where: { id: requestId },
          data: { status: 'approved' },
        });
      });
    } else {
      const invalidRole = roles.find((role) =>
        !roleApprovalRequiresRequest(role.approvalPolicy) ||
        !roleMatchesAssignmentModesPolicy({
          accountType: account.accountType,
          scopeFor: role.scopeFor,
          scopeLevel: role.scopeLevel,
          modes: ['public'],
        }),
      );
      if (invalidRole) {
        return { success: false, error: 'One or more requested role scopes are not approvable for this account type.' };
      }

      await prisma.$transaction(async (tx) => {
        await cleanupExpiredAccessModel(tx);

        const connection = connectionId
          ? await tx.connection.findFirst({ where: { id: connectionId, appId, accountId }, select: { id: true } })
          : await tx.connection.findUnique({ where: { accountId_appId: { accountId, appId } }, select: { id: true } });

        for (const role of roles) {
          await ensureAccessGrant(tx, {
            memberAccountId: accountId,
            parentAccountId: accountId,
            childApplicationId: appId,
            accessApplicationId: appId,
            roleId: role.id,
            details: {
              connectionId: connection?.id ?? null,
              approvedBy: actorAccountId,
              approvedRequestId: requestId,
            },
          });
        }

        await tx.request.update({
          where: { id: requestId },
          data: { status: 'approved' },
        });
      });
    }

    await dispatchAccountUpdatedEvent({ accountId, changedFields: ['role'] });

    revalidatePath('/requests');
    revalidatePath(`/requests/${requestId}`);
    revalidateApplicationRequestsRoutes(appId);
    revalidateApplicationUsersRoutes(appId, connectionId || undefined);

    return { success: true };
  } catch (error) {
    await logError('database', error, `approveApplicationRoleRequest:${requestId}`);
    return { success: false, error: 'Failed to approve role request.' };
  }
}

export async function denyApplicationRoleRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const actorAccountId = await getActiveAccountId();
  if (!actorAccountId) return { success: false, error: 'Not signed in.' };

  const [canRootEdit, canManageRequests] = await Promise.all([
    hasRootApplicationPermission(ROOT_APPLICATION_ROLES_MANAGE_PERMISSION),
    checkPermissions(['root.requests.manage']),
  ]);

  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { data: true, recipientId: true },
    });
    if (!request) return { success: false, error: 'Request not found.' };

    const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
    const appId = typeof data.appId === 'string' ? data.appId : '';
    const requestTarget = typeof data.requestTarget === 'string' ? data.requestTarget : 'admin';
    const canManageAppRoles = appId ? await canCurrentAccountManageApplicationRoles(appId) : false;
    const canDeny =
      (canRootEdit && canManageRequests) ||
      (requestTarget === 'owner' ? request.recipientId === actorAccountId : canManageAppRoles);
    if (!canDeny) return { success: false, error: 'Permission denied.' };

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'denied' },
    });
    revalidatePath('/requests');
    revalidatePath(`/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `denyApplicationRoleRequest:${requestId}`);
    return { success: false, error: 'Failed to deny role request.' };
  }
}
