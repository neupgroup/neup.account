'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { dispatchAuthzWebhook } from './authz-webhook';
import { dispatchRoleUpdateWebhook, getRolePayload } from './role-update-events';
import { activeAccessWhere } from '@/services/access-model';
import {
  APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_EDIT_PERMISSION,
  getApplicationPermissionNames,
} from '@/services/applications/permission-definitions';
import { getRoleScopeCompatibilityError } from '@/services/applications/role-scope-compatibility';
import { hasRootApplicationPermission } from '@/services/applications/manage';
import {
  hasUsablePermissionScopes,
  isKnownPermissionScope,
  normalizePermissionScopes,
  permissionScopeError,
  type PermissionScopeOption,
} from '@/services/applications/permission-scopes';
import { isKnownRoleScope, roleScopeError } from '@/services/role-scopes';
import {
  revalidateApplicationConfigRoutes,
  revalidateApplicationPermissionsRoutes,
  revalidateApplicationRoleRoutes,
} from '@/services/applications/revalidate-routes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppPermission = {
  id: string;
  name: string;
  description: string | null;
  scope: PermissionScopeOption[];
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

const GLOBAL_AUTHZ_APP_ID = 'neup.account';

function getSystemRoleScope(roleId: string): string {
  if (roleId === 'application.manage') return 'managable';
  if (roleId === 'application.owner') return 'public';
  return 'public';
}

async function upsertPermissionsForApp(
  tx: any,
  appId: string,
  definitions: Array<{ id: string; name: string; description: string; scope: PermissionScopeOption[] }>,
): Promise<Array<{ id: string; name: string }>> {
  const persistedPermissions: Array<{ id: string; name: string }> = [];

  for (const definition of definitions) {
    const permission = await tx.authzPermission.upsert({
      where: { name_appId: { name: definition.name, appId } },
      update: {
        name: definition.name,
        description: definition.description,
        appId,
        scope: definition.scope,
      },
      create: {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        appId,
        scope: definition.scope,
      },
      select: {
        id: true,
        name: true,
      },
    });

    persistedPermissions.push(permission);
  }

  return persistedPermissions;
}

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
        select: { id: true, name: true, description: true, scope: true },
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

async function getMappedRoleIdsForPermission(permissionId: string): Promise<string[]> {
  const mappings = await prisma.authzRolePermissionMap.findMany({
    where: { permissionId },
    select: { roleId: true },
  });

  return Array.from(new Set(mappings.map((mapping) => mapping.roleId).filter(Boolean)));
}

async function syncRolePermissionsForRoleIds(roleIds: string[]): Promise<void> {
  for (const roleId of Array.from(new Set(roleIds))) {
    await syncRolePermissionsDenormalized(prisma, roleId);
  }
}

function hasUsableScope(scope: string | null | undefined): boolean {
  return typeof scope === 'string' && scope.trim().length > 0;
}

function validatePermissionScopes(scopes: string[]): PermissionScopeOption[] | null {
  const trimmed = scopes.map((scope) => scope.trim()).filter(Boolean);
  if (trimmed.length === 0) return null;
  if (trimmed.some((scope) => !isKnownPermissionScope(scope))) return null;

  return normalizePermissionScopes(trimmed);
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;

  const target = error.meta?.table;
  if (typeof target === 'string' && target === tableName) return true;

  return typeof error.message === 'string' && error.message.includes(`The table \`${tableName}\` does not exist`);
}

async function validateRolePermissionSelection(
  tx: any,
  appId: string,
  roleScope: string,
  permissionIds: string[],
): Promise<string | null> {
  if (permissionIds.length === 0) return null;

  const permissions = await tx.authzPermission.findMany({
    where: { id: { in: permissionIds }, appId },
    select: { id: true, scope: true },
  });

  if (permissions.length !== permissionIds.length) {
    return 'One or more permissions do not belong to this application.';
  }

  const missingScopePermission = permissions.find((permission: { scope: Prisma.JsonValue }) => !hasUsablePermissionScopes(permission.scope));
  if (missingScopePermission) {
    return 'Permissions without a scope cannot be added to a role.';
  }

  const compatibilityError = getRoleScopeCompatibilityError(
    roleScope,
    permissions.map((permission: { scope: Prisma.JsonValue }) => permission.scope),
  );
  if (compatibilityError) {
    return compatibilityError;
  }

  return null;
}

async function ensureApplicationManagementRoles(): Promise<void> {
  const permissionDefinitions = APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS.map((permission, index) => ({
    id: `cap-appmanage-${index + 1}-${permission.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`,
    ...permission,
  }));

  await prisma.$transaction(async (tx) => {
    const permissions = await upsertPermissionsForApp(tx, GLOBAL_AUTHZ_APP_ID, permissionDefinitions);

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
          scope: getSystemRoleScope(roleId),
        },
        create: {
          id: roleId,
          name: roleId,
          description:
            roleId === 'application.owner'
              ? 'Full ownership of an application.'
              : 'Manage application settings, roles, and permissions.',
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: getSystemRoleScope(roleId),
        },
      });
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      const permissionIds = permissions.map((permission) => permission.id);
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
  const isRootManager = await hasRootApplicationPermission(ROOT_APPLICATION_EDIT_PERMISSION);
  if (isRootManager) return { accountId };

  const personalAccountId = await getPersonalAccountId();
  const scopedManagePermissions = getApplicationPermissionNames(
    ['roles.manage'],
    [personalAccountId && personalAccountId === accountId ? 'public' : 'managed'],
  );

  const grants = await prisma.access.findMany({
    where: {
      memberAccountId: accountId,
      accessApplicationId: appId,
      ...activeAccessWhere(),
    },
    select: {
      id: true,
      role: {
        select: {
          permissions: true,
        },
      },
    },
  });

  const hasScopedManagePermission = grants.some((grant) => {
    const permissionNames = Array.isArray(grant.role.permissions)
      ? grant.role.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
    return scopedManagePermissions.some((permissionName) => permissionNames.includes(permissionName));
  });

  if (!hasScopedManagePermission) return { error: 'Permission denied.' };
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
      select: { id: true, name: true, description: true, scope: true },
    });
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description,
      scope: normalizePermissionScopes(record.scope),
    }));
  } catch (error) {
    await logError('database', error, `getAppPermissions:${appId}`);
    return [];
  }
}

export async function createAppPermission(input: {
  appId: string;
  name: string;
  description?: string;
  scope: string[];
}): Promise<{ success: boolean; permission?: AppPermission; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Permission name is required.' };
  if (!/^[a-zA-Z0-9._]+$/.test(name)) {
    return { success: false, error: 'Permission name may only contain letters, numbers, dots (.), and underscores (_).' };
  }
  const scopes = validatePermissionScopes(input.scope);
  if (!scopes) {
    return { success: false, error: permissionScopeError() };
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
        scope: scopes,
        appId: input.appId,
      },
      select: { id: true, name: true, description: true, scope: true },
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: {
        id: record.id,
        name: record.name,
        description: record.description,
        scope: normalizePermissionScopes(record.scope),
      },
    };
  } catch (error) {
    await logError('database', error, `createAppPermission:${input.appId}`);
    return { success: false, error: 'Failed to create permission.' };
  }
}

export async function updateAppPermission(input: {
  appId: string;
  permissionId: string;
  description?: string;
  scope: string[];
}): Promise<{ success: boolean; permission?: AppPermission; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const scopes = validatePermissionScopes(input.scope);
  if (!scopes) {
    return { success: false, error: permissionScopeError() };
  }

  try {
    const affectedRoleIds = await getMappedRoleIdsForPermission(input.permissionId);

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.authzPermission.findFirst({
        where: { id: input.permissionId, appId: input.appId },
        select: { id: true, scope: true },
      });
      if (!existing) throw new Error('Permission not found.');

      const affectedRoles = await tx.authzRole.findMany({
        where: {
          appId: input.appId,
          permissionMappings: { some: { permissionId: input.permissionId } },
        },
        select: { id: true, name: true, scope: true },
      });

      for (const role of affectedRoles) {
        const compatibilityError = getRoleScopeCompatibilityError(role.scope, [scopes]);
        if (compatibilityError) {
          throw new Error(`Permission scope update would invalidate role "${role.name ?? role.id}". Remove that permission from the role first.`);
        }
      }

      const updated = await tx.authzPermission.update({
        where: { id: input.permissionId },
        data: {
          description: input.description?.trim() || null,
          scope: scopes,
        },
        select: { id: true, name: true, description: true, scope: true },
      });

      return updated;
    });

    await syncRolePermissionsForRoleIds(affectedRoleIds);

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: {
        id: record.id,
        name: record.name,
        description: record.description,
        scope: normalizePermissionScopes(record.scope),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    await logError('database', error, `updateAppPermission:${input.appId}`);
    return { success: false, error: message || 'Failed to update permission.' };
  }
}

export async function deleteAppPermission(input: {
  appId: string;
  permissionId: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    const affectedRoleIds = await getMappedRoleIdsForPermission(input.permissionId);

    await prisma.$transaction(async (tx) => {
      await tx.authzPermission.delete({ where: { id: input.permissionId } });
    });

    await syncRolePermissionsForRoleIds(affectedRoleIds);

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
                  scope: [],
                }];
              }

              if (!p || typeof p !== 'object') return [];

              const obj = p as {
                  id?: string;
                  name?: string;
                  description?: string | null;
                  scope?: Prisma.JsonValue;
              };

              const name = typeof obj.name === 'string' ? obj.name : '';
              const id = typeof obj.id === 'string' ? obj.id : '';
              if (!name) return [];

              return [{
                id,
                name,
                description: typeof obj.description === 'string' ? obj.description : null,
                scope: normalizePermissionScopes(obj.scope),
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
  permissionIds?: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Role name is required.' };
  if (!/^[A-Za-z0-9._]+$/.test(name)) {
    return { success: false, error: 'Role name may only contain letters, numbers, dots (.) and underscores (_).' };
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

      const permissionIds = input.permissionIds ?? [];
      if (permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, scope, permissionIds);
        if (selectionError) throw new Error(selectionError);

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: permissionIds }, appId: input.appId },
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
    const message = error instanceof Error ? error.message : '';
    await logError('database', error, `createAppRole:${input.appId}`);
    return { success: false, error: message || 'Failed to create role.' };
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
        select: { id: true, name: true, scope: true },
      });
      if (!role) throw new Error('Role not found.');

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, role.scope, input.permissionIds);
        if (selectionError) throw new Error(selectionError);

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
    const message = error instanceof Error ? error.message : '';
    await logError('database', error, `updateAppRolePermissions:${input.appId}`);
    return { success: false, error: message || 'Failed to update role permissions.' };
  }
}

export async function updateAppRole(input: {
  appId: string;
  roleId: string;
  name?: string;
  description?: string;
  scope?: string;
  permissionIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, scope: true, name: true },
      });
      if (!role) throw new Error('Role not found.');
      const scope = role.scope;
      if (!isKnownRoleScope(scope)) {
        throw new Error(roleScopeError());
      }
      if (typeof input.name === 'string' && input.name.trim() !== role.name) {
        throw new Error('Role name cannot be changed after creation.');
      }
      if (typeof input.scope === 'string' && input.scope.trim() !== scope) {
        throw new Error('Role scope cannot be changed. Delete and recreate the role instead.');
      }

      await tx.authzRole.update({
        where: { id: input.roleId },
        data: {
          description: input.description?.trim() || null,
        },
      });

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, scope, input.permissionIds);
        if (selectionError) throw new Error(selectionError);

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
    if (input.appId === GLOBAL_AUTHZ_APP_ID && ['application.owner', 'application.manage'].includes(input.roleId)) {
      return { success: false, error: 'This system role cannot be deleted.' };
    }

    const rolePayload = await getRolePayload(input.appId, input.roleId);
    const deletionCheck = await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, name: true },
      });
      if (!role) {
        return { canDelete: false as const, error: 'Role not found.' };
      }

      const [defaultRoleCount, connectionCount, accessCount, memberRoleCount] = await Promise.all([
        tx.application.count({ where: { defaultRoleId: input.roleId } }),
        tx.connection.count({ where: { roleId: input.roleId } }),
        tx.access.count({ where: { roleId: input.roleId } }),
        tx.role.count({ where: { roleId: input.roleId } }),
      ]);

      let assetGrantCount = 0;
      try {
        assetGrantCount = await tx.authzAssetsAccessGrant.count({ where: { role_id: input.roleId } });
      } catch (error) {
        if (!isMissingTableError(error, 'public.authz_assets_access_grant')) {
          throw error;
        }
      }

      if (defaultRoleCount > 0) {
        return {
          canDelete: false as const,
          error: 'This role is the default role for one or more applications. Clear it as the default role first.',
        };
      }

      const totalAssignments = connectionCount + accessCount + memberRoleCount + assetGrantCount;
      if (totalAssignments > 0) {
        return {
          canDelete: false as const,
          error: 'This role is still assigned to members, connections, or access grants. Reassign or remove those usages first.',
        };
      }

      await tx.authzRole.delete({ where: { id: input.roleId } });
      return { canDelete: true as const };
    });

    if (!deletionCheck.canDelete) {
      return { success: false, error: deletionCheck.error };
    }

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

    revalidateApplicationRoleRoutes(input.appId, input.roleId ?? undefined);
    revalidateApplicationConfigRoutes(input.appId);
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

    revalidateApplicationRoleRoutes(appId);
    revalidatePath(`/data/appconnection/${appId}`);

    return { success: true, cleared: { roles: rolesResult.count, access: 0 } };
  } catch (error) {
    await logError('database', error, `clearAuthzPushStatus:${appId}`);
    return { success: false, cleared: { roles: 0, access: 0 }, error: 'Failed to clear push status.' };
  }
}
