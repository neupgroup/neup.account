'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { dispatchAuthzWebhook } from './authz-webhook';
import { checkPermissions } from '@/services/user';
import { dispatchRoleUpdateWebhook, getRolePayload } from './role-update-events';
import { activeAccessWhere } from '@/services/access-model';
import { isKnownRoleScope, roleScopeError } from '@/services/role-scopes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppPermission = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  tag: Prisma.JsonValue | null;
};

export type AppRole = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  permissions: AppPermission[];
};

export async function getAppDefaultRoleId(appId: string): Promise<string | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { defaultRoleId: true },
    });
    return app?.defaultRoleId ?? null;
  } catch (error) {
    await logError('database', error, `getAppDefaultRoleId:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

const ROOT_ROLE_MANAGE_PERMISSIONS = ['root.application.edit'];
const GLOBAL_AUTHZ_APP_ID = 'neup.account';

async function syncRolePermissionMappings(tx: any, roleId: string, permissionIds: string[]): Promise<void> {
  await tx.authzRolePermissionMap.deleteMany({ where: { roleId } });
  if (permissionIds.length === 0) return;

  await tx.authzRolePermissionMap.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

async function syncRolePermissionsDenormalized(tx: any, roleId: string): Promise<void> {
  const mappedPermissions = await tx.authzRolePermissionMap.findMany({
    where: { roleId },
    select: {
      permission: {
        select: { id: true, name: true, description: true, scope: true, tag: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const permissions = Array.from(
    new Set(
      mappedPermissions
        .map((row: { permission: { name: string } }) => row.permission?.name)
        .filter((permissionName: unknown): permissionName is string => typeof permissionName === 'string' && permissionName.length > 0),
    ),
  );

  await tx.authzRole.update({
    where: { id: roleId },
    data: { permissions },
  });

  await tx.role.updateMany({
    where: { roleId },
    data: { permissions },
  });
}

async function syncAllRolePermissionsDenormalized(tx: any, appId: string): Promise<void> {
  const roles = await tx.authzRole.findMany({
    where: { appId },
    select: { id: true },
  });

  for (const role of roles) {
    await syncRolePermissionsDenormalized(tx, role.id);
  }
}

async function ensureApplicationManagementRoles(): Promise<void> {
  const permissions = [
    { id: 'cap-appmanage-application-view', name: 'application.view', description: 'View application details and settings.' },
    { id: 'cap-appmanage-application-edit', name: 'application.edit', description: 'Edit application details, secrets, access fields, policies, and endpoints.' },
    { id: 'cap-appmanage-application-delete', name: 'application.delete', description: 'Delete or deactivate an application.' },
    { id: 'cap-appmanage-application-logs-view', name: 'application.logs.view', description: 'View application activity logs.' },
    { id: 'cap-appmanage-application-devlogs-view', name: 'application.devlogs.view', description: 'View development API request/response logs for the application.' },
    { id: 'cap-appmanage-application-roles-view', name: 'application.roles.view', description: 'View application roles and permissions.' },
    { id: 'cap-appmanage-application-roles-manage', name: 'application.roles.manage', description: 'Create, update, and delete application roles and permissions.' },
  ] as const;

  await prisma.$transaction(async (tx) => {
    for (const cap of permissions) {
      await tx.authzPermission.upsert({
        where: { id: cap.id },
        update: {
          name: cap.name,
          description: cap.description,
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
          tag: 'application',
        },
        create: {
          id: cap.id,
          name: cap.name,
          description: cap.description,
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
          tag: 'application',
        },
      });
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      await tx.authzRole.upsert({
        where: { id: roleId },
        update: {
          name: roleId,
          description:
            roleId === 'application.owner'
              ? 'Full ownership of an application.'
              : 'Manage application settings, roles, and permissions.',
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
        create: {
          id: roleId,
          name: roleId,
          description:
            roleId === 'application.owner'
              ? 'Full ownership of an application.'
              : 'Manage application settings, roles, and permissions.',
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
      });
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      const permissionIds = permissions.map((cap) => cap.id);
      await syncRolePermissionMappings(tx, roleId, permissionIds);
      await syncRolePermissionsDenormalized(tx, roleId);
    }
  });
}

async function assertCanManageAuthz(appId: string): Promise<{ accountId: string } | { error: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { error: 'Not signed in.' };

  // Ensure management roles/permissions are always present in authz tables.
  await ensureApplicationManagementRoles();

  // Root override: global root app editors can manage app roles/permissions.
  const isRootManager = await checkPermissions(ROOT_ROLE_MANAGE_PERMISSIONS, accountId);
  if (isRootManager) return { accountId };

  const grant = await prisma.access.findFirst({
    where: {
      roleId: { in: ['application.owner', 'application.manage', 'application.edit', 'app.manage', 'app.edit'] },
      memberAccountId: accountId,
      accessApplicationId: appId,
      ...activeAccessWhere(),
    },
    select: { id: true },
  });

  if (!grant) return { error: 'Permission denied.' };
  return { accountId };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function getAppPermissions(appId: string): Promise<AppPermission[]> {
  try {
    const records = await prisma.authzPermission.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, scope: true, tag: true },
    });
    return records;
  } catch (error) {
    await logError('database', error, `getAppPermissions:${appId}`);
    return [];
  }
}

export async function createAppPermission(input: {
  appId: string;
  name: string;
  description?: string;
  scope?: string;
  tag?: Prisma.InputJsonValue;
}): Promise<{ success: boolean; permission?: AppPermission; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Permission name is required.' };
  if (!/^[a-zA-Z0-9._]+$/.test(name)) {
    return { success: false, error: 'Permission name may only contain letters, numbers, dots (.), and underscores (_).' };
  }
  const scope = input.scope?.trim() || 'application';
  if (!/^[a-zA-Z0-9._]+$/.test(scope)) {
    return { success: false, error: 'Permission scope may only contain letters, numbers, dots (.), and underscores (_).' };
  }

  const existing = await prisma.authzPermission.findFirst({
    where: { appId: input.appId, name },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A permission named "${name}" already exists for this application.` };
  }

  try {
    const record = await prisma.authzPermission.create({
      data: {
        name,
        description: input.description?.trim() || null,
        scope,
        tag: input.tag ?? Prisma.JsonNull,
        appId: input.appId,
      },
      select: { id: true, name: true, description: true, scope: true, tag: true },
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, permission: record };
  } catch (error) {
    await logError('database', error, `createAppPermission:${input.appId}`);
    return { success: false, error: 'Failed to create permission.' };
  }
}

export async function updateAppPermission(input: {
  appId: string;
  permissionId: string;
  description?: string;
  scope?: string;
  tag?: Prisma.InputJsonValue;
}): Promise<{ success: boolean; permission?: AppPermission; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };
  const scope = input.scope?.trim() || 'application';
  if (!/^[a-zA-Z0-9._]+$/.test(scope)) {
    return { success: false, error: 'Permission scope may only contain letters, numbers, dots (.), and underscores (_).' };
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.authzPermission.findFirst({
        where: { id: input.permissionId, appId: input.appId },
        select: { id: true },
      });
      if (!existing) throw new Error('Permission not found.');

      const updated = await tx.authzPermission.update({
        where: { id: input.permissionId },
        data: {
          description: input.description?.trim() || null,
          scope,
          tag: input.tag ?? Prisma.JsonNull,
        },
        select: { id: true, name: true, description: true, scope: true, tag: true },
      });

      await syncAllRolePermissionsDenormalized(tx, input.appId);
      return updated;
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, permission: record };
  } catch (error) {
    await logError('database', error, `updateAppPermission:${input.appId}`);
    return { success: false, error: 'Failed to update permission.' };
  }
}

export async function deleteAppPermission(input: {
  appId: string;
  permissionId: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.authzPermission.delete({ where: { id: input.permissionId } });
      await syncAllRolePermissionsDenormalized(tx, input.appId);
    });
    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteAppPermission:${input.appId}`);
    return { success: false, error: 'Failed to delete permission.' };
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function getAppRoles(appId: string): Promise<AppRole[]> {
  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
        permissions: true,
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,
      permissions: Array.isArray(role.permissions)
        ? role.permissions
            .flatMap((p): AppPermission[] => {
              if (typeof p === 'string') {
                return [{
                  id: '',
                  name: p,
                  description: null,
                  scope: 'application',
                  tag: null,
                }];
              }

              if (!p || typeof p !== 'object') return [];

              const obj = p as {
                  id?: string;
                  name?: string;
                  description?: string | null;
                  scope?: string;
                  tag?: Prisma.JsonValue | null;
              };

              const name = typeof obj.name === 'string' ? obj.name : '';
              const id = typeof obj.id === 'string' ? obj.id : '';
              if (!name) return [];

              return [{
                id,
                name,
                description: typeof obj.description === 'string' ? obj.description : null,
                scope: typeof obj.scope === 'string' ? obj.scope : 'application',
                tag: obj.tag ?? null,
              }];
            })
        : [],
    }));
  } catch (error) {
    await logError('database', error, `getAppRoles:${appId}`);
    return [];
  }
}

export async function createAppRole(input: {
  appId: string;
  name: string;
  description?: string;
  scope?: string;
  permissionIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Role name is required.' };
  if (!/^[a-z0-9._]+$/.test(name)) {
    return { success: false, error: 'Role name may only contain lowercase letters, numbers, dots (.) and underscores (_).' };
  }

  // Enforce uniqueness: one role per name per app
  const existing = await prisma.authzRole.findFirst({
    where: { name, appId: input.appId },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A role named "${name}" already exists for this application.` };
  }

  try {
    const scope = input.scope?.trim() || '';
    if (!isKnownRoleScope(scope)) {
      return { success: false, error: roleScopeError() };
    }

    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.authzRole.create({
        data: {
          name,
          description: input.description?.trim() || null,
          scope,
          appId: input.appId,
        },
        select: { id: true, name: true, description: true, scope: true },
      });

      if (input.permissionIds.length > 0) {
        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await syncRolePermissionMappings(tx, created.id, caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, created.id);
      } else {
        await syncRolePermissionMappings(tx, created.id, []);
        await syncRolePermissionsDenormalized(tx, created.id);
      }

      return created;
    });

    // Dispatch webhook
    const fullRole = await getAppRoles(input.appId).then((roles) =>
      roles.find((r) => r.id === role.id) ?? { ...role, permissions: [] }
    );

    await dispatchRoleUpdateWebhook({
      appId: input.appId,
      eventType: 'role.updated',
      role: {
        id: fullRole.id,
        name: fullRole.name,
        description: fullRole.description,
        scope: fullRole.scope,
        permissions: fullRole.permissions.map((p) => p.name),
      },
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, role: fullRole };
  } catch (error) {
    await logError('database', error, `createAppRole:${input.appId}`);
    return { success: false, error: 'Failed to create role.' };
  }
}

export async function updateAppRolePermissions(input: {
  appId: string;
  roleId: string;
  permissionIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, name: true },
      });
      if (!role) throw new Error('Role not found.');

      if (input.permissionIds.length > 0) {
        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await syncRolePermissionMappings(tx, input.roleId, caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, input.roleId);
      } else {
        await syncRolePermissionMappings(tx, input.roleId, []);
        await syncRolePermissionsDenormalized(tx, input.roleId);
      }
    });

    const rolePayload = await getRolePayload(input.appId, input.roleId);
    if (rolePayload) {
      await dispatchRoleUpdateWebhook({
        appId: input.appId,
        eventType: 'role.updated',
        role: rolePayload,
      });
    }

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppRolePermissions:${input.appId}`);
    return { success: false, error: 'Failed to update role permissions.' };
  }
}

export async function updateAppRole(input: {
  appId: string;
  roleId: string;
  name: string;
  description?: string;
  scope?: string;
  permissionIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Role name is required.' };
  if (!/^[a-z0-9._]+$/.test(name)) {
    return { success: false, error: 'Role name may only contain lowercase letters, numbers, dots (.) and underscores (_).' };
  }

  const scope = input.scope?.trim() || '';
  if (!isKnownRoleScope(scope)) {
    return { success: false, error: roleScopeError() };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true },
      });
      if (!role) throw new Error('Role not found.');

      const duplicate = await tx.authzRole.findFirst({
        where: {
          appId: input.appId,
          name,
          id: { not: input.roleId },
        },
        select: { id: true },
      });
      if (duplicate) throw new Error(`A role named "${name}" already exists for this application.`);

      await tx.authzRole.update({
        where: { id: input.roleId },
        data: {
          name,
          description: input.description?.trim() || null,
          scope,
        },
      });

      if (input.permissionIds.length > 0) {
        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true },
        });
        await syncRolePermissionMappings(tx, input.roleId, caps.map((cap) => cap.id));
      } else {
        await syncRolePermissionMappings(tx, input.roleId, []);
      }

      await syncRolePermissionsDenormalized(tx, input.roleId);
    });

    const rolePayload = await getRolePayload(input.appId, input.roleId);
    if (rolePayload) {
      await dispatchRoleUpdateWebhook({
        appId: input.appId,
        eventType: 'role.updated',
        role: rolePayload,
      });
    }

    const role = await getAppRoles(input.appId).then((roles) => roles.find((item) => item.id === input.roleId));
    revalidatePath(`/data/appconnection/${input.appId}`);
    return role ? { success: true, role } : { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    await logError('database', error, `updateAppRole:${input.appId}`);
    return { success: false, error: message || 'Failed to update role.' };
  }
}

export async function deleteAppRole(input: {
  appId: string;
  roleId: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    const rolePayload = await getRolePayload(input.appId, input.roleId);
    await prisma.authzRole.delete({ where: { id: input.roleId } });

    if (rolePayload) {
      await dispatchRoleUpdateWebhook({
        appId: input.appId,
        eventType: 'role.deleted',
        role: rolePayload,
      });
    }

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteAppRole:${input.appId}`);
    return { success: false, error: 'Failed to delete role.' };
  }
}

export async function setAppDefaultRole(input: {
  appId: string;
  roleId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    if (input.roleId) {
      const role = await prisma.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true },
      });
      if (!role) return { success: false, error: 'Role does not belong to this application.' };
    }

    await prisma.application.update({
      where: { id: input.appId },
      data: { defaultRoleId: input.roleId ?? null },
    });

    revalidatePath(`/application/${input.appId}/roles`);
    revalidatePath(`/application/${input.appId}/config`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `setAppDefaultRole:${input.appId}`);
    return { success: false, error: 'Failed to set default role.' };
  }
}

// ---------------------------------------------------------------------------
// Push all roles + permissions to the registered webhook
// ---------------------------------------------------------------------------

export async function pushAuthzToWebhook(appId: string): Promise<{
  success: boolean;
  pushed: number;
  error?: string;
}> {
  const auth = await assertCanManageAuthz(appId);
  if ('error' in auth) return { success: false, pushed: 0, error: auth.error };

  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId, pushed: false },
      select: {
        id: true,
        name: true,
        scope: true,
      },
    });

    if (roles.length === 0) {
      return { success: true, pushed: 0 };
    }

    const roleIds = roles.map((role) => role.id);
    const roleMaps = await prisma.authzRolePermissionMap.findMany({
      where: {
        roleId: { in: roleIds },
      },
      select: {
        roleId: true,
        permissionId: true,
        permission: {
          select: {
            name: true,
          },
        },
      },
    });

    // Push each role-permission mapping as an insert
    for (const map of roleMaps) {
      const role = roles.find((candidate) => candidate.id === map.roleId);
      if (!role) continue;

      await dispatchAuthzWebhook(appId, {
        table: 'authz_role_permission_map',
        operation: 'insert',
        data: {
          roleId: map.roleId,
          permissionId: map.permissionId,
          scope: role.scope ?? null,
          denormalizedPermission: map.permission?.name ? [map.permission.name] : [],
          roleName: role.name ?? null,
        },
      });
    }

    await prisma.authzRole.updateMany({
      where: { id: { in: roleIds } },
      data: { pushed: true },
    });

    return { success: true, pushed: roleMaps.length };
  } catch (error) {
    await logError('webhook', error, `pushAuthzToWebhook:${appId}`);
    return { success: false, pushed: 0, error: 'Failed to push data.' };
  }
}

// ---------------------------------------------------------------------------
// Clear push status (roles + app access grants)
// ---------------------------------------------------------------------------

export async function clearAuthzPushStatus(appId: string): Promise<{
  success: boolean;
  cleared: { roles: number; access: number };
  error?: string;
}> {
  const auth = await assertCanManageAuthz(appId);
  if ('error' in auth) return { success: false, cleared: { roles: 0, access: 0 }, error: auth.error };

  try {
    const [rolesResult] = await prisma.$transaction([
      prisma.authzRole.updateMany({ where: { appId }, data: { pushed: false } }),
    ]);

    revalidatePath(`/application/${appId}/roles`);
    revalidatePath(`/data/appconnection/${appId}`);

    return { success: true, cleared: { roles: rolesResult.count, access: 0 } };
  } catch (error) {
    await logError('database', error, `clearAuthzPushStatus:${appId}`);
    return { success: false, cleared: { roles: 0, access: 0 }, error: 'Failed to clear push status.' };
  }
}
