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
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_ROLES_MANAGE_PERMISSION,
  ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION,
  ROOT_APPLICATION_ROLES_VIEW_PERMISSION,
  getApplicationPermissionNames,
  isBuiltInApplicationManagementPermissionName,
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
import { isKnownRoleScope, normalizeRoleScope, roleScopeError } from '@/services/role-scopes';
import {
  revalidateApplicationConfigRoutes,
  revalidateApplicationPermissionsRoutes,
  revalidateApplicationRoleRoutes,
} from '@/services/applications/revalidate-routes';
import { buildAuthzEntityId } from '@/services/applications/identifiers';

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
  applicableFor: string[];
  permissions: AppPermission[];
};

export type PermissionScopeImpactRole = {
  roleId: string;
  roleName: string;
  roleScope: string;
};

function normalizeApplicableFor(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

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
const GLOBAL_AUTHZ_SYSTEM_ROLE_IDS = new Set(['application.owner', 'application.manage']);

function getSystemRoleScope(roleId: string): string {
  if (roleId === 'application.owner') return 'public.individual';
  if (roleId === 'application.manage') return 'managed.individual';
  return 'public.individual';
}

function isGlobalAuthzSystemRole(roleId: string): boolean {
  return GLOBAL_AUTHZ_SYSTEM_ROLE_IDS.has(roleId);
}

async function isSystemManagedPermission(appId: string, permissionId: string): Promise<boolean> {
  if (appId !== GLOBAL_AUTHZ_APP_ID) return false;

  const permission = await prisma.authzPermission.findFirst({
    where: { id: permissionId, appId },
    select: { name: true },
  });

  return !!permission && isBuiltInApplicationManagementPermissionName(permission.name);
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

async function syncRolePermissionMappings(tx: any, roleId: string, roleScope: string, permissionIds: string[]): Promise<void> {
  await tx.authzRolePermissionMap.deleteMany({ where: { roleId } });
  if (permissionIds.length === 0) return;

  await tx.authzRolePermissionMap.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId, scope: roleScope })),
    skipDuplicates: true,
  });
}

async function syncRolePermissionsDenormalized(tx: any, roleId: string): Promise<void> {
  const roleRecord = await tx.authzRole.findUnique({
    where: { id: roleId },
    select: { appId: true },
  });
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
        .map((row: { permission: { id: string; name: string } }) =>
          roleRecord?.appId === GLOBAL_AUTHZ_APP_ID ? row.permission?.name : row.permission?.id
        )
        .filter((permissionValue: unknown): permissionValue is string => typeof permissionValue === 'string' && permissionValue.length > 0),
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

async function getImpactedRoleMappingsForPermissionScopes(
  tx: any,
  appId: string,
  permissionId: string,
  nextScopes: PermissionScopeOption[],
): Promise<PermissionScopeImpactRole[]> {
  const mappings = await tx.authzRolePermissionMap.findMany({
    where: {
      permissionId,
      role: { appId },
    },
    select: {
      roleId: true,
      scope: true,
      role: {
        select: {
          name: true,
          scope: true,
        },
      },
    },
  });

  return mappings
    .filter((mapping: { scope: string | null | undefined }) => !!getRoleScopeCompatibilityError(mapping.scope, [nextScopes]))
    .map((mapping: { roleId: string; scope: string; role: { name: string | null; scope: string } | null }) => ({
      roleId: mapping.roleId,
      roleName: mapping.role?.name?.trim() || mapping.roleId,
      roleScope: normalizeRoleScope(mapping.scope) ?? mapping.role?.scope ?? mapping.scope,
    }))
    .sort((a: PermissionScopeImpactRole, b: PermissionScopeImpactRole) => {
      const nameCompare = a.roleName.localeCompare(b.roleName, undefined, { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return a.roleScope.localeCompare(b.roleScope, undefined, { sensitivity: 'base' });
    });
}

async function dispatchRoleUpdatesForRoleIds(appId: string, roleIds: string[]): Promise<void> {
  for (const roleId of Array.from(new Set(roleIds))) {
    const rolePayload = await getRolePayload(appId, roleId);
    if (!rolePayload) continue;

    await dispatchRoleUpdateWebhook({
      appId,
      eventType: 'role.updated',
      role: rolePayload,
    });
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
  const permissionDefinitions = APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.map((permission, index) => ({
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
      const allowedPermissionNames =
        roleId === 'application.owner'
          ? new Set(APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS.map((permission) => permission.name))
          : null;
      const permissionIds = permissions
        .filter((permission) => !allowedPermissionNames || allowedPermissionNames.has(permission.name))
        .map((permission) => permission.id);
      await syncRolePermissionMappings(tx, roleId, getSystemRoleScope(roleId), permissionIds);
      await syncRolePermissionsDenormalized(tx, roleId);
    }
  });
}

async function assertCanViewAuthz(appId: string): Promise<{ accountId: string } | { error: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { error: 'Not signed in.' };

  // Ensure management roles/permissions are always present in authz tables.
  await ensureApplicationManagementRoles();

  const isRootViewer = await hasRootApplicationPermission(ROOT_APPLICATION_ROLES_VIEW_PERMISSION);
  if (isRootViewer) return { accountId };

  const personalAccountId = await getPersonalAccountId();
  const scopedViewPermissions = getApplicationPermissionNames(
    ['roles.view', 'roles.manage', 'roles.resetPush'],
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

  const hasScopedViewPermission = grants.some((grant) => {
    const permissionNames = Array.isArray(grant.role.permissions)
      ? grant.role.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
    return scopedViewPermissions.some((permissionName) => permissionNames.includes(permissionName));
  });

  if (!hasScopedViewPermission) return { error: 'Permission denied.' };
  return { accountId };
}

async function assertCanManageAuthz(appId: string): Promise<{ accountId: string } | { error: string }> {
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return auth;

  const isRootManager = await hasRootApplicationPermission(ROOT_APPLICATION_ROLES_MANAGE_PERMISSION);
  if (isRootManager) return auth;

  const personalAccountId = await getPersonalAccountId();
  const scopedManagePermissions = getApplicationPermissionNames(
    ['roles.manage'],
    [personalAccountId && personalAccountId === auth.accountId ? 'public' : 'managed'],
  );

  const grants = await prisma.access.findMany({
    where: {
      memberAccountId: auth.accountId,
      accessApplicationId: appId,
      ...activeAccessWhere(),
    },
    select: {
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
  return auth;
}

async function assertCanResetAuthzPush(appId: string): Promise<{ accountId: string } | { error: string }> {
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return auth;

  const isRootManager = await hasRootApplicationPermission(ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION);
  if (isRootManager) return auth;

  const personalAccountId = await getPersonalAccountId();
  const scopedResetPermissions = getApplicationPermissionNames(
    ['roles.resetPush'],
    [personalAccountId && personalAccountId === auth.accountId ? 'public' : 'managed'],
  );

  const grants = await prisma.access.findMany({
    where: {
      memberAccountId: auth.accountId,
      accessApplicationId: appId,
      ...activeAccessWhere(),
    },
    select: {
      role: {
        select: {
          permissions: true,
        },
      },
    },
  });

  const hasScopedResetPermission = grants.some((grant) => {
    const permissionNames = Array.isArray(grant.role.permissions)
      ? grant.role.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
    return scopedResetPermissions.some((permissionName) => permissionNames.includes(permissionName));
  });

  if (!hasScopedResetPermission) return { error: 'Permission denied.' };
  return auth;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function getAppPermissions(appId: string): Promise<AppPermission[]> {
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return [];

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
  if (!name) return { success: false, error: 'Permission title is required.' };
  let permissionId = '';
  try {
    permissionId = buildAuthzEntityId(input.appId, name);
  } catch {
    return { success: false, error: 'Permission title must include letters or numbers.' };
  }
  const scopes = validatePermissionScopes(input.scope);
  if (!scopes) {
    return { success: false, error: permissionScopeError() };
  }

  const existing = await prisma.authzPermission.findUnique({
    where: { id: permissionId },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A permission with this title already exists for this application.` };
  }

  try {
    const record = await prisma.authzPermission.create({
      data: {
        id: permissionId,
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
  confirmScopeRemoval?: boolean;
}): Promise<{
  success: boolean;
  permission?: AppPermission;
  error?: string;
  requiresConfirmation?: boolean;
  impactedRoles?: PermissionScopeImpactRole[];
}> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const scopes = validatePermissionScopes(input.scope);
  if (!scopes) {
    return { success: false, error: permissionScopeError() };
  }

  try {
    if (await isSystemManagedPermission(input.appId, input.permissionId)) {
      return {
        success: false,
        error: 'This system-managed permission cannot be edited.',
      };
    }

    const affectedRoleIds = await getMappedRoleIdsForPermission(input.permissionId);
    const impactedRoles = await prisma.$transaction((tx) =>
      getImpactedRoleMappingsForPermissionScopes(tx, input.appId, input.permissionId, scopes),
    );

    if (impactedRoles.length > 0 && !input.confirmScopeRemoval) {
      return {
        success: false,
        error: 'Updating this permission scope will remove it from incompatible roles.',
        requiresConfirmation: true,
        impactedRoles,
      };
    }

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.authzPermission.findFirst({
        where: { id: input.permissionId, appId: input.appId },
        select: { id: true, scope: true },
      });
      if (!existing) throw new Error('Permission not found.');

      if (impactedRoles.length > 0) {
        await tx.authzRolePermissionMap.deleteMany({
          where: {
            permissionId: input.permissionId,
            roleId: { in: impactedRoles.map((role) => role.roleId) },
            scope: { in: impactedRoles.map((role) => role.roleScope) },
          },
        });
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
    if (impactedRoles.length > 0) {
      await dispatchRoleUpdatesForRoleIds(input.appId, impactedRoles.map((role) => role.roleId));
    }

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
    if (await isSystemManagedPermission(input.appId, input.permissionId)) {
      return {
        success: false,
        error: 'This system-managed permission cannot be removed.',
      };
    }

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
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return [];

  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
        applicableFor: true,
        permissionMappings: {
          orderBy: { createdAt: 'asc' },
          select: {
            permission: {
              select: {
                id: true,
                name: true,
                description: true,
                scope: true,
              },
            },
          },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: normalizeRoleScope(role.scope) ?? role.scope,
      applicableFor: normalizeApplicableFor(role.applicableFor),
      permissions: role.permissionMappings.flatMap((mapping): AppPermission[] => {
        const permission = mapping.permission;
        if (!permission?.id || !permission?.name) return [];
        return [{
          id: permission.id,
          name: permission.name,
          description: permission.description ?? null,
          scope: normalizePermissionScopes(permission.scope),
        }];
      }),
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
  applicableFor?: string[];
  permissionIds?: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Role title is required.' };
  let roleId = '';
  try {
    roleId = buildAuthzEntityId(input.appId, name);
  } catch {
    return { success: false, error: 'Role title must include letters or numbers.' };
  }

  const existing = await prisma.authzRole.findUnique({
    where: { id: roleId },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A role with this title already exists for this application.` };
  }

  try {
    const scope = input.scope?.trim() || '';
    if (!isKnownRoleScope(scope)) {
      return { success: false, error: roleScopeError() };
    }
    const applicableFor = Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));

    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.authzRole.create({
        data: {
          id: roleId,
          name,
          description: input.description?.trim() || null,
          scope,
          appId: input.appId,
          applicableFor,
        },
        select: { id: true, name: true, description: true, scope: true, applicableFor: true },
      });

      const permissionIds = input.permissionIds ?? [];
      if (permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, scope, permissionIds);
        if (selectionError) throw new Error(selectionError);

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: permissionIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await syncRolePermissionMappings(tx, created.id, scope, caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, created.id);
      } else {
        await syncRolePermissionMappings(tx, created.id, scope, []);
        await syncRolePermissionsDenormalized(tx, created.id);
      }

      return created;
    });

    // Dispatch webhook
    const fullRole = await getAppRoles(input.appId).then((roles) =>
      roles.find((r) => r.id === role.id) ?? { ...role, applicableFor: normalizeApplicableFor(role.applicableFor), permissions: [] }
    );

    await dispatchRoleUpdateWebhook({
      appId: input.appId,
      eventType: 'role.updated',
      role: {
        id: fullRole.id,
        name: fullRole.name,
        description: fullRole.description,
        scope: fullRole.scope,
        applicableFor: fullRole.applicableFor,
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
    if (input.appId === GLOBAL_AUTHZ_APP_ID && isGlobalAuthzSystemRole(input.roleId)) {
      return { success: false, error: 'This system role cannot be modified.' };
    }

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

        await syncRolePermissionMappings(tx, input.roleId, normalizeRoleScope(role.scope) ?? role.scope, caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, input.roleId);
      } else {
        await syncRolePermissionMappings(tx, input.roleId, normalizeRoleScope(role.scope) ?? role.scope, []);
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
  applicableFor?: string[];
  permissionIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    if (input.appId === GLOBAL_AUTHZ_APP_ID && isGlobalAuthzSystemRole(input.roleId)) {
      return { success: false, error: 'This system role cannot be modified.' };
    }

    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, scope: true, name: true },
      });
      if (!role) throw new Error('Role not found.');
      const currentScope = normalizeRoleScope(role.scope);
      if (!currentScope || !isKnownRoleScope(currentScope)) {
        throw new Error(roleScopeError());
      }
      const nextScope = typeof input.scope === 'string' && input.scope.trim().length > 0
        ? normalizeRoleScope(input.scope)
        : currentScope;
      if (!nextScope || !isKnownRoleScope(nextScope)) {
        throw new Error(roleScopeError());
      }
      const applicableFor = Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));
      if (typeof input.name === 'string' && input.name.trim() !== role.name) {
        throw new Error('Role title cannot be changed after creation.');
      }

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, nextScope, input.permissionIds);
        if (selectionError) throw new Error(selectionError);
      }

      await tx.authzRole.update({
        where: { id: input.roleId },
        data: {
          description: input.description?.trim() || null,
          scope: nextScope,
          applicableFor,
        },
      });

      if (input.permissionIds.length > 0) {

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true },
        });
        await syncRolePermissionMappings(tx, input.roleId, nextScope, caps.map((cap) => cap.id));
      } else {
        await syncRolePermissionMappings(tx, input.roleId, nextScope, []);
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
    if (input.appId === GLOBAL_AUTHZ_APP_ID && isGlobalAuthzSystemRole(input.roleId)) {
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
        scope: true,
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
          scope: map.scope ?? role.scope ?? null,
          denormalizedPermission: map.permissionId ? [map.permissionId] : [],
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
  const auth = await assertCanResetAuthzPush(appId);
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
