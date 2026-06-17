'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import { canAssignRoleScopeToAccount } from '@/services/role-scopes';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function approveApplicationRoleRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const actorAccountId = await getActiveAccountId();
  if (!actorAccountId) return { success: false, error: 'Not signed in.' };

  const canApprove = await checkPermissions(['root.application.edit', 'root.requests.manage']);
  if (!canApprove) return { success: false, error: 'Permission denied.' };

  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, data: true },
    });
    if (!request) return { success: false, error: 'Request not found.' };
    if (request.status !== 'pending') return { success: false, error: 'Request is not pending.' };

    const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
    const appId = typeof data.appId === 'string' ? data.appId : '';
    const accountId = typeof data.accountId === 'string' ? data.accountId : '';
    const connectionId = typeof data.connectionId === 'string' ? data.connectionId : '';
    const assignmentKind = typeof data.assignmentKind === 'string' ? data.assignmentKind : '';
    const roleIds = stringList(data.roleIds);

    if (!appId || !accountId || roleIds.length === 0) {
      return { success: false, error: 'Request payload is missing role assignment details.' };
    }

    const [account, roles] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { accountType: true } }),
      prisma.authzRole.findMany({
        where: { id: { in: roleIds }, appId },
        select: { id: true, scope: true },
      }),
    ]);
    if (!account) return { success: false, error: 'Target account not found.' };
    if (roles.length !== roleIds.length) return { success: false, error: 'One or more requested roles were not found.' };

    if (assignmentKind === 'connectionRole') {
      const role = roles[0];
      if (!role || !canAssignRoleScopeToAccount(role.scope, account.accountType, ['toApprove'])) {
        return { success: false, error: 'Requested role scope is not approvable for this account type.' };
      }

      const connection = await prisma.connection.findFirst({
        where: { id: connectionId, appId, accountId },
        select: { id: true },
      });
      if (!connection) return { success: false, error: 'Connection not found.' };

      await prisma.$transaction(async (tx) => {
        await tx.connection.update({
          where: { id: connection.id },
          data: { roleId: role.id },
        });
        await tx.request.update({
          where: { id: requestId },
          data: { status: 'approved' },
        });
      });
    } else {
      const invalidRole = roles.find((role) => !canAssignRoleScopeToAccount(role.scope, account.accountType, ['toApprove']));
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
    revalidatePath(`/application/${appId}/requests`);
    revalidatePath(`/application/${appId}/users`);
    if (connectionId) revalidatePath(`/application/${appId}/users/${connectionId}`);

    return { success: true };
  } catch (error) {
    await logError('database', error, `approveApplicationRoleRequest:${requestId}`);
    return { success: false, error: 'Failed to approve role request.' };
  }
}

export async function denyApplicationRoleRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const canDeny = await checkPermissions(['root.application.edit', 'root.requests.manage']);
  if (!canDeny) return { success: false, error: 'Permission denied.' };

  try {
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

