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
import {
  PERMISSION_ACQUISITION_TYPES,
  PERMISSION_APPROVAL_POLICIES,
} from '@/services/neup-account/permission-catalog';
import { hasRootApplicationPermission } from '@/services/applications/manage';
import {
  getRoleAccessFlags,
  getStoredRoleAccessPolicy,
  isKnownRoleScope,
  normalizeRoleAcquisitionType,
  normalizeRoleApprovalPolicy,
  normalizeRoleScope,
  normalizeRoleScopes,
  roleScopeError,
  type RoleAccessFlags,
} from '@/services/role-scopes';
import {
  revalidateApplicationConfigRoutes,
  revalidateApplicationPermissionsRoutes,
  revalidateApplicationRoleRoutes,
} from '@/services/applications/revalidate-routes';
import { buildAuthzEntityId } from '@/services/applications/identifiers';
import {
  extractApplicationAuthzConfig,
  normalizeConfiguredSelection,
  type ApplicationAuthzConfig,
} from '@/services/applications/authz-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppPermission = {
  id: string;
  name: string;
  description: string | null;
  scope: string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
  assignable: boolean;
  publiclyEnrollable: boolean;
  selfAssigned: boolean;
  rootManaged: boolean;
  publiclyRequestable: boolean;
  requestableToOwner: boolean;
  rules: string | null;
  status: string | null;
};

export type AppRole = {
  id: string;
  name: string;
  description: string | null;
  scope: string[];
  acquisitionType: string;
  approvalPolicy: string;
  assignable: boolean;
  publiclyEnrollable: boolean;
  selfAssigned: boolean;
  rootManaged: boolean;
  publiclyRequestable: boolean;
  requestableToOwner: boolean;
  applicableFor: string[];
  permissions: AppPermission[];
};

function withRoleAccessFlags(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
): RoleAccessFlags {
  return getRoleAccessFlags(acquisitionType, approvalPolicy);
}

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

function formatPermissionScope(value: Prisma.JsonValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatRoleScope(value: Prisma.JsonValue | null | undefined): string[] {
  return normalizeRoleScopes(value);
}

function parsePermissionScopeInput(value: string | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as Prisma.InputJsonValue;
  } catch {
    return trimmed;
  }
}

function parseRoleScopeTokens(value: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((scope) => scope.trim())
        .filter((scope) => isKnownRoleScope(scope)),
    ),
  );
}

function parseRoleScopeInput(value: string[] | undefined): Prisma.InputJsonValue {
  return parseRoleScopeTokens(value);
}

function validateRoleScopeInput(value: string[] | undefined): string[] {
  const tokens = parseRoleScopeTokens(value);
  if (tokens.length === 0) {
    throw new Error(roleScopeError());
  }
  return tokens;
}

function normalizePermissionAcquisitionType(value: string | null | undefined): string {
  const normalized = (value ?? '').trim();
  return PERMISSION_ACQUISITION_TYPES.includes(normalized as (typeof PERMISSION_ACQUISITION_TYPES)[number])
    ? normalized
    : 'assignment';
}

function normalizePermissionApprovalPolicy(value: string | null | undefined): string {
  const normalized = (value ?? '').trim();
  return PERMISSION_APPROVAL_POLICIES.includes(normalized as (typeof PERMISSION_APPROVAL_POLICIES)[number])
    ? normalized
    : 'none';
}

function parsePermissionScopeTokens(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (typeof parsed === 'string') {
      return parsed.trim() ? [parsed.trim()] : [];
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Permission scope must be a string or string array.');
    }

    const tokens = parsed.map((item) => {
      if (typeof item !== 'string') {
        throw new Error('Permission scope entries must be strings.');
      }

      const token = item.trim();
      if (!token) {
        throw new Error('Permission scope entries cannot be empty.');
      }

      return token;
    });

    return Array.from(new Set(tokens));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission scope')) {
      throw error;
    }

    return Array.from(
      new Set(
        trimmed
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
      ),
    );
  }
}

async function validatePermissionScopeInput(appId: string, value: string | undefined): Promise<void> {
  const tokens = parsePermissionScopeTokens(value);
  if (tokens.length === 0) return;

  const authzConfig = await getApplicationAuthzConfigForValidation(appId);
  const allowedKeys = authzConfig.definedScopes.map(([, key]) => key);
  const allowedSet = new Set(allowedKeys);

  if (allowedSet.size === 0) {
    throw new Error('No scopes are configured for this application.');
  }

  if (!authzConfig.allowMultipleDefinedScopes && tokens.length > 1) {
    throw new Error('Only one configured scope is allowed for this permission.');
  }

  const invalidTokens = tokens.filter((token) => !allowedSet.has(token));
  if (invalidTokens.length > 0) {
    throw new Error('Scope must use only configured application scopes.');
  }
}

async function getApplicationAuthzConfigForValidation(appId: string): Promise<ApplicationAuthzConfig> {
  const application = await prisma.application.findUnique({
    where: { id: appId },
    select: { details: true },
  });

  return extractApplicationAuthzConfig(application?.details);
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
const AUTHZ_SYSTEM_SYNC_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function getSystemRoleScope(roleId: string): string {
  if (roleId === 'application.manage') return 'rootMgmt.self';
  return 'acMgmt.self';
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
  definitions: Array<{
    id: string;
    name: string;
    description: string;
    scope: string[];
    acquisitionType?: string;
    approvalPolicy?: string;
    assignable?: boolean;
    publiclyEnrollable?: boolean;
    selfAssigned?: boolean;
    rootManaged?: boolean;
    publiclyRequestable?: boolean;
    requestableToOwner?: boolean;
  }>,
): Promise<Array<{ id: string; name: string }>> {
  const persistedPermissions: Array<{ id: string; name: string }> = [];

  for (const definition of definitions) {
    const storedPolicy = getStoredRoleAccessPolicy(definition);
    const permission = await tx.authzPermission.upsert({
      where: { name_appId: { name: definition.name, appId } },
      update: {
        name: definition.name,
        description: definition.description,
        appId,
        scope: definition.scope,
        acquisitionType: storedPolicy.acquisitionType,
        approvalPolicy: storedPolicy.approvalPolicy,
      },
      create: {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        appId,
        scope: definition.scope,
        acquisitionType: storedPolicy.acquisitionType,
        approvalPolicy: storedPolicy.approvalPolicy,
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

async function syncRolePermissionMappings(tx: any, roleId: string, roleScope: Prisma.InputJsonValue, permissionIds: string[]): Promise<void> {
  await tx.authzRolePermissionMap.deleteMany({ where: { roleId } });
  if (permissionIds.length === 0) return;

  await tx.authzRolePermissionMap.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId, scope: roleScope })),
    skipDuplicates: true,
  });
}

async function syncRolePermissionsDenormalized(tx: any, roleId: string): Promise<void> {
  const mappedPermissions = await tx.authzRolePermissionMap.findMany({
    where: { roleId },
    select: {
      permission: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const permissions = Array.from(
    new Set(
      mappedPermissions
        .map((row: { permission: { name: string } }) => row.permission?.name)
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

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;

  const target = error.meta?.table;
  if (typeof target === 'string' && target === tableName) return true;

  return typeof error.message === 'string' && error.message.includes(`The table \`${tableName}\` does not exist`);
}

async function validateRolePermissionSelection(
  tx: any,
  appId: string,
  permissionIds: string[],
): Promise<string | null> {
  if (permissionIds.length === 0) return null;

  const permissions = await tx.authzPermission.findMany({
    where: { id: { in: permissionIds }, appId },
    select: { id: true },
  });

  if (permissions.length !== permissionIds.length) {
    return 'One or more permissions do not belong to this application.';
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
          acquisitionType: 'system_generated',
          approvalPolicy: 'none',
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
          acquisitionType: 'system_generated',
          approvalPolicy: 'none',
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
  }, AUTHZ_SYSTEM_SYNC_TRANSACTION_OPTIONS);
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
      select: { id: true, name: true, description: true, scope: true, acquisitionType: true, approvalPolicy: true, rules: true, status: true } as any,
    }) as Array<any>;
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description,
      scope: formatPermissionScope(record.scope),
      acquisitionType: record.acquisitionType ?? 'assignment',
      approvalPolicy: record.approvalPolicy ?? 'none',
      ...withRoleAccessFlags(record.acquisitionType, record.approvalPolicy),
      rules: record.rules ?? null,
      status: record.status ?? null,
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
  scope?: string;
  acquisitionType?: string;
  approvalPolicy?: string;
  assignable?: boolean;
  publiclyEnrollable?: boolean;
  selfAssigned?: boolean;
  rootManaged?: boolean;
  publiclyRequestable?: boolean;
  requestableToOwner?: boolean;
  rules?: string;
  status?: string;
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

  const existing = await prisma.authzPermission.findUnique({
    where: { id: permissionId },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A permission with this title already exists for this application.` };
  }

  try {
    await validatePermissionScopeInput(input.appId, input.scope);
    const storedPolicy = getStoredRoleAccessPolicy(input);

    const record = await prisma.authzPermission.create({
      data: {
        id: permissionId,
        name,
        description: input.description?.trim() || null,
        scope: parsePermissionScopeInput(input.scope),
        acquisitionType: storedPolicy.acquisitionType,
        approvalPolicy: storedPolicy.approvalPolicy,
        rules: input.rules?.trim() || null,
        status: input.status?.trim() || null,
        appId: input.appId,
      } as any,
      select: { id: true, name: true, description: true, scope: true, acquisitionType: true, approvalPolicy: true, rules: true, status: true } as any,
    }) as any;

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: {
        id: record.id,
        name: record.name,
        description: record.description,
        scope: formatPermissionScope(record.scope),
        acquisitionType: record.acquisitionType ?? 'assignment',
        approvalPolicy: record.approvalPolicy ?? 'none',
        ...withRoleAccessFlags(record.acquisitionType, record.approvalPolicy),
        rules: record.rules ?? null,
        status: record.status ?? null,
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
  scope?: string;
  acquisitionType?: string;
  approvalPolicy?: string;
  assignable?: boolean;
  publiclyEnrollable?: boolean;
  selfAssigned?: boolean;
  rootManaged?: boolean;
  publiclyRequestable?: boolean;
  requestableToOwner?: boolean;
  rules?: string;
  status?: string;
}): Promise<{
  success: boolean;
  permission?: AppPermission;
  error?: string;
}> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    if (await isSystemManagedPermission(input.appId, input.permissionId)) {
      return {
        success: false,
        error: 'This system-managed permission cannot be edited.',
      };
    }

    await validatePermissionScopeInput(input.appId, input.scope);
    const storedPolicy = getStoredRoleAccessPolicy(input);

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
          scope: parsePermissionScopeInput(input.scope),
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          rules: input.rules?.trim() || null,
          status: input.status?.trim() || null,
        } as any,
        select: { id: true, name: true, description: true, scope: true, acquisitionType: true, approvalPolicy: true, rules: true, status: true } as any,
      }) as any;

      return updated;
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: {
        id: record.id,
        name: record.name,
        description: record.description,
        scope: formatPermissionScope(record.scope),
        acquisitionType: record.acquisitionType ?? 'assignment',
        approvalPolicy: record.approvalPolicy ?? 'none',
        ...withRoleAccessFlags(record.acquisitionType, record.approvalPolicy),
        rules: record.rules ?? null,
        status: record.status ?? null,
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
        acquisitionType: true,
        approvalPolicy: true,
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
                acquisitionType: true,
                approvalPolicy: true,
                rules: true,
                status: true,
              },
            },
          },
        },
      },
    }) as Array<any>;

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: formatRoleScope(role.scope),
      acquisitionType: normalizeRoleAcquisitionType(role.acquisitionType),
      approvalPolicy: normalizeRoleApprovalPolicy(role.approvalPolicy),
      ...withRoleAccessFlags(role.acquisitionType, role.approvalPolicy),
      applicableFor: normalizeApplicableFor(role.applicableFor),
      permissions: role.permissionMappings.flatMap((mapping: any): AppPermission[] => {
        const permission = mapping.permission;
        if (!permission?.id || !permission?.name) return [];
        return [{
          id: permission.id,
          name: permission.name,
          description: permission.description ?? null,
          scope: formatPermissionScope(permission.scope),
          acquisitionType: permission.acquisitionType ?? 'assignment',
          approvalPolicy: permission.approvalPolicy ?? 'none',
          ...withRoleAccessFlags(permission.acquisitionType, permission.approvalPolicy),
          rules: permission.rules ?? null,
          status: permission.status ?? null,
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
  scope?: string[];
  acquisitionType?: string;
  approvalPolicy?: string;
  assignable?: boolean;
  publiclyEnrollable?: boolean;
  selfAssigned?: boolean;
  rootManaged?: boolean;
  publiclyRequestable?: boolean;
  requestableToOwner?: boolean;
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
    const scope = validateRoleScopeInput(input.scope);
    const storedPolicy = getStoredRoleAccessPolicy(input);
    const authzConfig = await getApplicationAuthzConfigForValidation(input.appId);
    const allowedApplicableForKeys = authzConfig.applicableForDefinitions.map(([, key]) => key);
    const applicableFor = allowedApplicableForKeys.length > 0
      ? normalizeConfiguredSelection(input.applicableFor, allowedApplicableForKeys, true)
      : Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));
    if (allowedApplicableForKeys.length > 0 && (input.applicableFor?.length ?? 0) !== applicableFor.length) {
      return { success: false, error: 'Selected applicable-for values are invalid for this application.' };
    }

    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.authzRole.create({
        data: {
          id: roleId,
          name,
          description: input.description?.trim() || null,
          scope: parseRoleScopeInput(scope) as any,
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          appId: input.appId,
          applicableFor,
        },
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
          acquisitionType: true,
          approvalPolicy: true,
          applicableFor: true,
        },
      });

      const permissionIds = input.permissionIds ?? [];
      if (permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, permissionIds);
        if (selectionError) throw new Error(selectionError);

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: permissionIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await syncRolePermissionMappings(tx, created.id, parseRoleScopeInput(scope), caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, created.id);
      } else {
        await syncRolePermissionMappings(tx, created.id, parseRoleScopeInput(scope), []);
        await syncRolePermissionsDenormalized(tx, created.id);
      }

      return created;
    });

    // Dispatch webhook
    const fullRole = await getAppRoles(input.appId).then((roles) =>
      roles.find((r) => r.id === role.id) ?? {
        ...role,
        scope: formatRoleScope(role.scope),
        acquisitionType: normalizeRoleAcquisitionType(role.acquisitionType),
        approvalPolicy: normalizeRoleApprovalPolicy(role.approvalPolicy),
        ...withRoleAccessFlags(role.acquisitionType, role.approvalPolicy),
        applicableFor: normalizeApplicableFor(role.applicableFor),
        permissions: [],
      }
    );

    await dispatchRoleUpdateWebhook({
      appId: input.appId,
      eventType: 'role.updated',
      role: {
        id: fullRole.id,
        name: fullRole.name,
        description: fullRole.description,
        scope: fullRole.scope,
        acquisitionType: fullRole.acquisitionType,
        approvalPolicy: fullRole.approvalPolicy,
        assignable: fullRole.assignable,
        publiclyEnrollable: fullRole.publiclyEnrollable,
        selfAssigned: fullRole.selfAssigned,
        rootManaged: fullRole.rootManaged,
        publiclyRequestable: fullRole.publiclyRequestable,
        requestableToOwner: fullRole.requestableToOwner,
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
        const selectionError = await validateRolePermissionSelection(tx, input.appId, input.permissionIds);
        if (selectionError) throw new Error(selectionError);

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await syncRolePermissionMappings(tx, input.roleId, role.scope as Prisma.InputJsonValue, caps.map((cap) => cap.id));
        await syncRolePermissionsDenormalized(tx, input.roleId);
      } else {
        await syncRolePermissionMappings(tx, input.roleId, role.scope as Prisma.InputJsonValue, []);
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
  scope?: string[];
  acquisitionType?: string;
  approvalPolicy?: string;
  assignable?: boolean;
  publiclyEnrollable?: boolean;
  selfAssigned?: boolean;
  rootManaged?: boolean;
  publiclyRequestable?: boolean;
  requestableToOwner?: boolean;
  applicableFor?: string[];
  permissionIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    if (input.appId === GLOBAL_AUTHZ_APP_ID && isGlobalAuthzSystemRole(input.roleId)) {
      return { success: false, error: 'This system role cannot be modified.' };
    }
    const authzConfig = await getApplicationAuthzConfigForValidation(input.appId);
    const storedPolicy = getStoredRoleAccessPolicy(input);
    const allowedApplicableForKeys = authzConfig.applicableForDefinitions.map(([, key]) => key);
    const applicableFor = allowedApplicableForKeys.length > 0
      ? normalizeConfiguredSelection(input.applicableFor, allowedApplicableForKeys, true)
      : Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));
    if (allowedApplicableForKeys.length > 0 && (input.applicableFor?.length ?? 0) !== applicableFor.length) {
      return { success: false, error: 'Selected applicable-for values are invalid for this application.' };
    }

    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, scope: true, name: true },
      });
      if (!role) throw new Error('Role not found.');
      const currentScope = validateRoleScopeInput(formatRoleScope(role.scope));
      if (currentScope.length === 0) {
        throw new Error(roleScopeError());
      }
      const nextScope = Array.isArray(input.scope) && input.scope.length > 0
        ? validateRoleScopeInput(input.scope)
        : currentScope;
      if (nextScope.length === 0) {
        throw new Error(roleScopeError());
      }
      if (typeof input.name === 'string' && input.name.trim() !== role.name) {
        throw new Error('Role title cannot be changed after creation.');
      }

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, input.permissionIds);
        if (selectionError) throw new Error(selectionError);
      }

      await tx.authzRole.update({
        where: { id: input.roleId },
        data: {
          description: input.description?.trim() || null,
          scope: parseRoleScopeInput(nextScope) as any,
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          applicableFor,
        },
      });

      if (input.permissionIds.length > 0) {

        const caps = await tx.authzPermission.findMany({
          where: { id: { in: input.permissionIds }, appId: input.appId },
          select: { id: true },
        });
        await syncRolePermissionMappings(tx, input.roleId, parseRoleScopeInput(nextScope), caps.map((cap) => cap.id));
      } else {
        await syncRolePermissionMappings(tx, input.roleId, parseRoleScopeInput(nextScope), []);
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
        const blockers = [
          connectionCount > 0
            ? `${connectionCount} connection assignment${connectionCount === 1 ? '' : 's'}`
            : null,
          accessCount > 0
            ? `${accessCount} access row${accessCount === 1 ? '' : 's'}`
            : null,
          memberRoleCount > 0
            ? `${memberRoleCount} member-role row${memberRoleCount === 1 ? '' : 's'}`
            : null,
          assetGrantCount > 0
            ? `${assetGrantCount} asset access grant${assetGrantCount === 1 ? '' : 's'}`
            : null,
        ].filter((value): value is string => Boolean(value));

        return {
          canDelete: false as const,
          error: `This role is still referenced by ${blockers.join(', ')}. Remove those references first.`,
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
