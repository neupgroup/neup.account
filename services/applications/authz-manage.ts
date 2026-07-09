'use server';

/*
::neup.documentation::application-authz-manage
::title Application Authz Management Service

Owns CRUD operations for application roles and permissions, plus the sync path that keeps role-permission snapshots and webhook payloads current.

::public

This service validates authz editor input, persists role and permission metadata, expands compatible role-permission scope rows, and revalidates the related management routes.

::public end

::private

The service stores `scope_for` / `scope_level` directly while still deriving legacy acquisition and approval columns for compatibility with older consumers.

::private end

::end
*/

import { revalidatePath } from 'next/cache';
import { permission } from '@/logica/permission';
import { Prisma } from '@/prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/logica/account/verify';
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
import {
  AUTHZ_SCOPE_FOR_VALUES,
  AUTHZ_SCOPE_LEVEL_VALUES,
  deriveLegacyRoleScopesFromPolicy,
  getCompatibleRolePermissionScopePairs,
  getScopeLevelsFromStoredPolicy,
  getStoredPolicyForScopeLevel,
  normalizeAuthzScopeFor,
  normalizeAuthzScopeLevels,
  normalizeSingleAuthzScopeLevel,
  type AuthzScopeFor,
  type AuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';
import {
  getAuthzScopePolicyColumnSupport,
  isMissingAuthzScopePolicyColumnError,
} from '@/services/applications/authz-scope-policy-columns';

const servicePermissions = [
  permission('application.roles.view.root', 'for_individual', 'service'),
  permission('application.roles.manage.root', 'for_individual', 'service'),
  permission('application.roles.resetPush.root', 'for_individual', 'service'),
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppPermission = {
  id: string;
  name: string;
  description: string | null;
  scopeFor: AuthzScopeFor[];
  scopeLevel: AuthzScopeLevel[];
  acquisitionType: string | null;
  approvalPolicy: string | null;
  rules: string | null;
  status: string | null;
};

export type AppRole = {
  id: string;
  name: string;
  description: string | null;
  scopeFor: AuthzScopeFor[];
  scopeLevel: AuthzScopeLevel;
  acquisitionType: string;
  approvalPolicy: string;
  applicableFor: string[];
  permissions: AppPermission[];
};

type RawAppRoleRow = {
  id: string;
  name: string;
  description: string | null;
  scopeForText: string | null;
  scopeLevel: string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
  applicableForText: string | null;
};

type RawManagedRoleRecord = {
  id: string;
  name: string | null;
  scopeForText: string | null;
  scopeLevelText: string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
};

type RawAppPermissionRow = {
  roleId: string;
  id: string;
  name: string;
  description: string | null;
  scopeForText: string | null;
  scopeLevelText: string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
  rules: string | null;
  status: string | null;
};

function parseStoredJsonText(value: string | null | undefined): Prisma.JsonValue | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as Prisma.JsonValue;
  } catch {
    return trimmed;
  }
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

function formatScopeFor(value: Prisma.JsonValue | null | undefined, allowMultiple = true): AuthzScopeFor[] {
  return normalizeAuthzScopeFor(value, allowMultiple);
}

function formatScopeLevels(value: Prisma.JsonValue | null | undefined): AuthzScopeLevel[] {
  return normalizeAuthzScopeLevels(value, true);
}

/*
::neup.documentation::application-managed-role-loader

Loads one authz role record for mutation flows.

The loader reads role scope policy from `scope_for` and `scope_level`.

::end
*/

async function loadManagedRoleRecord(
  tx: any,
  input: {
    roleId: string;
    appId?: string;
  },
): Promise<{
  id: string;
  name: string | null;
  scopeFor: Prisma.JsonValue | string | null;
  scopeLevel: Prisma.JsonValue | string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
} | null> {
  const columnSupport = await getAuthzScopePolicyColumnSupport();
  const role = await tx.authzRole.findFirst({
    where: {
      id: input.roleId,
      ...(input.appId ? { appId: input.appId } : {}),
    },
    select: columnSupport.role
      ? {
          id: true,
          name: true,
          scopeFor: true,
          scopeLevel: true,
          acquisitionType: true,
          approvalPolicy: true,
        }
      : {
          id: true,
          name: true,
          acquisitionType: true,
          approvalPolicy: true,
        },
  });

  if (!role) return null;

  return {
    id: role.id,
    name: (role as any).name ?? null,
    scopeFor: (role as any).scopeFor ?? null,
    scopeLevel: (role as any).scopeLevel ?? null,
    acquisitionType: role.acquisitionType ?? null,
    approvalPolicy: role.approvalPolicy ?? null,
  };
}

function formatRoleScopeLevel(
  value: string | null | undefined,
  acquisitionType?: string | null,
  approvalPolicy?: string | null,
): AuthzScopeLevel {
  const normalized = normalizeSingleAuthzScopeLevel(value);
  if (normalized !== 'assignable' || value === 'assignable') {
    return normalized;
  }

  return getScopeLevelsFromStoredPolicy(acquisitionType, approvalPolicy)[0] ?? 'assignable';
}

function getPermissionScopeFor(record: {
  scopeFor?: Prisma.JsonValue | null;
}): AuthzScopeFor[] {
  return formatScopeFor(record.scopeFor);
}

function getPermissionScopeLevel(record: {
  scopeLevel?: Prisma.JsonValue | null;
  acquisitionType?: string | null;
  approvalPolicy?: string | null;
}): AuthzScopeLevel[] {
  const parsed = formatScopeLevels(record.scopeLevel);
  return parsed.length > 0 ? parsed : getScopeLevelsFromStoredPolicy(record.acquisitionType, record.approvalPolicy);
}

function getRoleScopeFor(record: {
  scopeFor?: Prisma.JsonValue | null;
}): AuthzScopeFor[] {
  return formatScopeFor(record.scopeFor);
}

function mapPermissionRecord(record: any): AppPermission {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    scopeFor: getPermissionScopeFor(record),
    scopeLevel: getPermissionScopeLevel(record),
    acquisitionType: record.acquisitionType ?? 'assignment',
    approvalPolicy: record.approvalPolicy ?? 'none',
    rules: record.rules ?? null,
    status: record.status ?? null,
  };
}

function mapRoleRecord(record: any): AppRole {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    scopeFor: getRoleScopeFor(record),
    scopeLevel: formatRoleScopeLevel(record.scopeLevel, record.acquisitionType, record.approvalPolicy),
    acquisitionType: record.acquisitionType ?? 'assignment',
    approvalPolicy: record.approvalPolicy ?? 'none',
    applicableFor: normalizeApplicableFor(record.applicableFor),
    permissions: record.permissionMappings.flatMap((mapping: any): AppPermission[] => {
      const permission = mapping.permission;
      if (!permission?.id || !permission?.name) return [];
      return [mapPermissionRecord(permission)];
    }),
  };
}

async function loadAppRolesWithMalformedJsonFallback(
  appId: string,
  columnSupport: Awaited<ReturnType<typeof getAuthzScopePolicyColumnSupport>>,
): Promise<AppRole[]> {
  const roleScopePolicySelect = columnSupport.role
    ? Prisma.sql`r."scope_for"::text AS "scopeForText", r."scope_level" AS "scopeLevel",`
    : Prisma.sql`NULL::text AS "scopeForText", NULL::text AS "scopeLevel",`;
  const permissionScopePolicySelect = columnSupport.permission
    ? Prisma.sql`p."scope_for"::text AS "scopeForText", p."scope_level"::text AS "scopeLevelText",`
    : Prisma.sql`NULL::text AS "scopeForText", NULL::text AS "scopeLevelText",`;

  const roleRows = await prisma.$queryRaw<RawAppRoleRow[]>(Prisma.sql`
    SELECT
      r."id",
      r."name",
      r."description",
      ${roleScopePolicySelect}
      r."acquisition_type" AS "acquisitionType",
      r."approval_policy" AS "approvalPolicy",
      r."applicable_for"::text AS "applicableForText"
    FROM "authz_role" r
    WHERE r."app_id" = ${appId}
    ORDER BY r."name" ASC
  `);

  const roleIds = roleRows.map((row) => row.id);
  const permissionRows = roleIds.length > 0
    ? await prisma.$queryRaw<RawAppPermissionRow[]>(Prisma.sql`
        SELECT
          rpm."role_id" AS "roleId",
          p."id",
          p."name",
          p."description",
          ${permissionScopePolicySelect}
          p."acquisition_type" AS "acquisitionType",
          p."approval_policy" AS "approvalPolicy",
          p."rules",
          p."status"
        FROM "authz_role_permission_map" rpm
        INNER JOIN "authz_permission" p ON p."id" = rpm."permission_id"
        WHERE rpm."role_id" IN (${Prisma.join(roleIds)})
        ORDER BY rpm."created_at" ASC
      `)
    : [];

  const permissionsByRoleId = new Map<string, AppPermission[]>();
  for (const row of permissionRows) {
    const permission = mapPermissionRecord({
      id: row.id,
      name: row.name,
      description: row.description,
      scopeFor: parseStoredJsonText(row.scopeForText),
      scopeLevel: parseStoredJsonText(row.scopeLevelText),
      acquisitionType: row.acquisitionType,
      approvalPolicy: row.approvalPolicy,
      rules: row.rules,
      status: row.status,
    });
    const existing = permissionsByRoleId.get(row.roleId);
    if (existing) {
      existing.push(permission);
    } else {
      permissionsByRoleId.set(row.roleId, [permission]);
    }
  }

  return roleRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scopeFor: getRoleScopeFor({
      scopeFor: parseStoredJsonText(row.scopeForText),
    }),
    scopeLevel: formatRoleScopeLevel(row.scopeLevel, row.acquisitionType, row.approvalPolicy),
    acquisitionType: row.acquisitionType ?? 'assignment',
    approvalPolicy: row.approvalPolicy ?? 'none',
    applicableFor: normalizeApplicableFor(parseStoredJsonText(row.applicableForText)),
    permissions: permissionsByRoleId.get(row.id) ?? [],
  }));
}

function parseScopeForInput(value: string[] | undefined, allowMultiple = true): AuthzScopeFor[] {
  return normalizeAuthzScopeFor(value, allowMultiple);
}

function parsePermissionScopeLevelInput(value: string[] | undefined): AuthzScopeLevel[] {
  return normalizeAuthzScopeLevels(value, true);
}

function parseRoleScopeLevelInput(value: string | undefined): AuthzScopeLevel {
  return normalizeSingleAuthzScopeLevel(value);
}

function validatePermissionScopeForInput(value: string[] | undefined): AuthzScopeFor[] {
  const tokens = parseScopeForInput(value, true);
  if (tokens.length === 0) {
    throw new Error(`Permission scope_for must use one or more of: ${AUTHZ_SCOPE_FOR_VALUES.join(', ')}.`);
  }
  return tokens;
}

function validatePermissionScopeLevelInput(value: string[] | undefined): AuthzScopeLevel[] {
  const tokens = parsePermissionScopeLevelInput(value);
  if (tokens.length === 0) {
    throw new Error(`Permission scope_level must use one or more of: ${AUTHZ_SCOPE_LEVEL_VALUES.join(', ')}.`);
  }
  return tokens;
}

function validateRoleScopeForInput(value: string[] | undefined): AuthzScopeFor[] {
  const tokens = parseScopeForInput(value, true);
  if (tokens.length === 0) {
    throw new Error(`Role scope_for must use one or more of: ${AUTHZ_SCOPE_FOR_VALUES.join(', ')}.`);
  }
  return tokens;
}

function validateRoleScopeLevelInput(value: string | undefined): AuthzScopeLevel {
  const token = parseRoleScopeLevelInput(value);
  if (!AUTHZ_SCOPE_LEVEL_VALUES.includes(token)) {
    throw new Error(`Role scope_level must use one of: ${AUTHZ_SCOPE_LEVEL_VALUES.join(', ')}.`);
  }
  return token;
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

function getSystemRoleScopeFor(roleId: string): AuthzScopeFor[] {
  void roleId;
  return ['for_individual'];
}

function getSystemRoleScopeLevel(roleId: string): AuthzScopeLevel {
  if (roleId === 'application.manage') return 'rootManaged';
  return 'selfAssigned';
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
    scopeFor: AuthzScopeFor[];
    scopeLevel: AuthzScopeLevel[];
  }>,
): Promise<Array<{ id: string; name: string }>> {
  const persistedPermissions: Array<{ id: string; name: string }> = [];
  let columnSupport = await getAuthzScopePolicyColumnSupport();

  for (const definition of definitions) {
    const storedPolicy = getStoredPolicyForScopeLevel(definition.scopeLevel[0] ?? 'assignable');
    const buildData = (includeScopePolicyColumns: boolean) => ({
      name: definition.name,
      description: definition.description,
      appId,
      ...(includeScopePolicyColumns ? {
        scopeFor: definition.scopeFor,
        scopeLevel: definition.scopeLevel,
      } : {}),
      acquisitionType: storedPolicy.acquisitionType,
      approvalPolicy: storedPolicy.approvalPolicy,
    });

    let permission;
    try {
      permission = await tx.authzPermission.upsert({
        where: { name_appId: { name: definition.name, appId } },
        update: buildData(columnSupport.permission),
        create: {
          id: definition.id,
          ...buildData(columnSupport.permission),
        },
        select: {
          id: true,
          name: true,
        },
      });
    } catch (error) {
      if (!columnSupport.permission || !isMissingAuthzScopePolicyColumnError(error)) {
        throw error;
      }

      columnSupport = { ...columnSupport, permission: false };
      permission = await tx.authzPermission.upsert({
        where: { name_appId: { name: definition.name, appId } },
        update: buildData(false),
        create: {
          id: definition.id,
          ...buildData(false),
        },
        select: {
          id: true,
          name: true,
        },
      });
    }

    persistedPermissions.push(permission);
  }

  return persistedPermissions;
}

async function syncRolePermissionMappings(tx: any, roleId: string, permissionIds: string[]): Promise<void> {
  const columnSupport = await getAuthzScopePolicyColumnSupport();
  const role = await loadManagedRoleRecord(tx, { roleId });

  await tx.authzRolePermissionMap.deleteMany({ where: { roleId } });
  if (!role || permissionIds.length === 0) return;

  const roleScopeFor = getRoleScopeFor(role);
  const roleScopeLevel = formatRoleScopeLevel((role as any).scopeLevel, role.acquisitionType, role.approvalPolicy);
  const permissions = await tx.authzPermission.findMany({
    where: { id: { in: permissionIds } },
    select: columnSupport.permission
      ? { id: true, scopeFor: true, scopeLevel: true, acquisitionType: true, approvalPolicy: true }
      : { id: true, acquisitionType: true, approvalPolicy: true },
  });

  const rows = permissions.flatMap((permission: any) =>
    getCompatibleRolePermissionScopePairs({
      roleScopeFor,
      roleScopeLevel,
      permissionScopeFor: getPermissionScopeFor(permission),
      permissionScopeLevels: getPermissionScopeLevel(permission),
    }).map((pair) => ({
      roleId,
      permissionId: permission.id,
      scopeFor: pair.scopeFor,
      scopeLevel: pair.scopeLevel,
    })),
  );

  if (rows.length === 0) return;

  await tx.authzRolePermissionMap.createMany({
    data: rows,
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

async function countLegacyAssetGrantRowsForRole(roleId: string): Promise<number> {
  try {
    return await prisma.authzAssetsAccessGrant.count({ where: { role_id: roleId } });
  } catch (error) {
    if (isMissingTableError(error, 'public.authz_assets_access_grant')) {
      return 0;
    }

    throw error;
  }
}

async function validateRolePermissionSelection(
  tx: any,
  appId: string,
  permissionIds: string[],
  rolePolicy?: { scopeFor: AuthzScopeFor[]; scopeLevel: AuthzScopeLevel },
): Promise<string | null> {
  if (permissionIds.length === 0) return null;
  const columnSupport = await getAuthzScopePolicyColumnSupport();

  const permissions = await tx.authzPermission.findMany({
    where: { id: { in: permissionIds }, appId },
    select: columnSupport.permission
      ? { id: true, name: true, scopeFor: true, scopeLevel: true, acquisitionType: true, approvalPolicy: true }
      : { id: true, name: true, acquisitionType: true, approvalPolicy: true },
  });

  if (permissions.length !== permissionIds.length) {
    return 'One or more permissions do not belong to this application.';
  }

  if (!rolePolicy) return null;

  const incompatible = permissions.filter((permission: any) =>
    getCompatibleRolePermissionScopePairs({
      roleScopeFor: rolePolicy.scopeFor,
      roleScopeLevel: rolePolicy.scopeLevel,
      permissionScopeFor: getPermissionScopeFor(permission),
      permissionScopeLevels: getPermissionScopeLevel(permission),
    }).length === 0,
  );

  if (incompatible.length > 0) {
    return `Role scope_for and scope_level are incompatible with: ${incompatible.map((permission: any) => permission.name).join(', ')}.`;
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
    let columnSupport = await getAuthzScopePolicyColumnSupport();

    for (const roleId of ['application.owner', 'application.manage']) {
      const buildData = (includeScopePolicyColumns: boolean) => ({
        name: roleId,
        description:
          roleId === 'application.owner'
            ? 'Full ownership of an application.'
            : 'Manage application settings, roles, and permissions.',
        appId: GLOBAL_AUTHZ_APP_ID,
        ...(includeScopePolicyColumns ? {
          scopeFor: getSystemRoleScopeFor(roleId),
          scopeLevel: getSystemRoleScopeLevel(roleId),
        } : {}),
        acquisitionType: 'system_generated',
        approvalPolicy: 'none',
      });

      try {
        await tx.authzRole.upsert({
          where: { id: roleId },
          update: buildData(columnSupport.role) as any,
          create: {
            id: roleId,
            ...buildData(columnSupport.role),
          } as any,
        });
      } catch (error) {
        if (!columnSupport.role || !isMissingAuthzScopePolicyColumnError(error)) {
          throw error;
        }

        columnSupport = { ...columnSupport, role: false };
        await tx.authzRole.upsert({
          where: { id: roleId },
          update: buildData(false) as any,
          create: {
            id: roleId,
            ...buildData(false),
          } as any,
        });
      }
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      const allowedPermissionNames =
        roleId === 'application.owner'
          ? new Set(APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS.map((permission) => permission.name))
          : null;
      const permissionIds = permissions
        .filter((permission) => !allowedPermissionNames || allowedPermissionNames.has(permission.name))
        .map((permission) => permission.id);
      await syncRolePermissionMappings(tx, roleId, permissionIds);
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
    const columnSupport = await getAuthzScopePolicyColumnSupport();
    const records = await prisma.authzPermission.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: columnSupport.permission ? {
        id: true,
        name: true,
        description: true,
        scopeFor: true,
        scopeLevel: true,
        acquisitionType: true,
        approvalPolicy: true,
        rules: true,
        status: true,
      } as any : {
        id: true,
        name: true,
        description: true,
        acquisitionType: true,
        approvalPolicy: true,
        rules: true,
        status: true,
      } as any,
    }) as Array<any>;
    return records.map(mapPermissionRecord);
  } catch (error) {
    await logError('database', error, `getAppPermissions:${appId}`);
    return [];
  }
}

export async function createAppPermission(input: {
  appId: string;
  name: string;
  description?: string;
  scopeFor?: string[];
  scopeLevel?: string[];
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
    const scopeFor = validatePermissionScopeForInput(input.scopeFor);
    const scopeLevel = validatePermissionScopeLevelInput(input.scopeLevel);
    const storedPolicy = getStoredPolicyForScopeLevel(scopeLevel[0] ?? 'assignable');
    const columnSupport = await getAuthzScopePolicyColumnSupport();

    const record = await prisma.authzPermission.create({
      data: {
        id: permissionId,
        name,
        description: input.description?.trim() || null,
        ...(columnSupport.permission ? { scopeFor, scopeLevel } : {}),
        acquisitionType: storedPolicy.acquisitionType,
        approvalPolicy: storedPolicy.approvalPolicy,
        rules: input.rules?.trim() || null,
        status: input.status?.trim() || null,
        appId: input.appId,
      } as any,
      select: columnSupport.permission ? {
        id: true,
        name: true,
        description: true,
        scopeFor: true,
        scopeLevel: true,
        acquisitionType: true,
        approvalPolicy: true,
        rules: true,
        status: true,
      } as any : {
        id: true,
        name: true,
        description: true,
        acquisitionType: true,
        approvalPolicy: true,
        rules: true,
        status: true,
      } as any,
    }) as any;

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: mapPermissionRecord(record),
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
  scopeFor?: string[];
  scopeLevel?: string[];
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

    const scopeFor = validatePermissionScopeForInput(input.scopeFor);
    const scopeLevel = validatePermissionScopeLevelInput(input.scopeLevel);
    const storedPolicy = getStoredPolicyForScopeLevel(scopeLevel[0] ?? 'assignable');
    const columnSupport = await getAuthzScopePolicyColumnSupport();

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
          ...(columnSupport.permission ? { scopeFor, scopeLevel } : {}),
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          rules: input.rules?.trim() || null,
          status: input.status?.trim() || null,
        } as any,
        select: columnSupport.permission ? {
          id: true,
          name: true,
          description: true,
          scopeFor: true,
          scopeLevel: true,
          acquisitionType: true,
          approvalPolicy: true,
          rules: true,
          status: true,
        } as any : {
          id: true,
          name: true,
          description: true,
          acquisitionType: true,
          approvalPolicy: true,
          rules: true,
          status: true,
        } as any,
      }) as any;

      return updated;
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return {
      success: true,
      permission: mapPermissionRecord(record),
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

export async function getAppRoleAccountCount(appId: string, roleId: string): Promise<number> {
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return 0;

  try {
    const accessRows = await prisma.access.findMany({
      where: {
        accessApplicationId: appId,
        roleId,
        memberAccountId: { not: null },
        ...activeAccessWhere(),
      },
      select: {
        memberAccountId: true,
      },
      distinct: ['memberAccountId'],
    });

    return accessRows.reduce((count, row) => {
      const accountId = typeof row.memberAccountId === 'string' ? row.memberAccountId.trim() : '';
      return accountId ? count + 1 : count;
    }, 0);
  } catch (error) {
    await logError('database', error, `getAppRoleAccountCount:${appId}:${roleId}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function getAppRoles(appId: string): Promise<AppRole[]> {
  const auth = await assertCanViewAuthz(appId);
  if ('error' in auth) return [];

  try {
    const columnSupport = await getAuthzScopePolicyColumnSupport();
    const roles = await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: columnSupport.role ? {
        id: true,
        name: true,
        description: true,
        scopeFor: true,
        scopeLevel: true,
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
                scopeFor: true,
                scopeLevel: true,
                acquisitionType: true,
                approvalPolicy: true,
                rules: true,
                status: true,
              } as any,
            },
          },
        },
      } : {
        id: true,
        name: true,
        description: true,
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
                acquisitionType: true,
                approvalPolicy: true,
                rules: true,
                status: true,
              } as any,
            },
          },
        },
      },
    }) as Array<any>;

    return roles.map(mapRoleRecord);
  } catch (error) {
    await logError('database', error, `getAppRoles:${appId}`);
    return [];
  }
}

export async function createAppRole(input: {
  appId: string;
  name: string;
  description?: string;
  scopeFor?: string[];
  scopeLevel?: string;
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
    const scopeFor = validateRoleScopeForInput(input.scopeFor);
    const scopeLevel = validateRoleScopeLevelInput(input.scopeLevel);
    const storedPolicy = getStoredPolicyForScopeLevel(scopeLevel);
    const columnSupport = await getAuthzScopePolicyColumnSupport();
    const authzConfig = await getApplicationAuthzConfigForValidation(input.appId);
    const allowedApplicableForKeys = authzConfig.applicableForDefinitions.map(([, key]) => key);
    const applicableFor = allowedApplicableForKeys.length > 0
      ? normalizeConfiguredSelection(input.applicableFor, allowedApplicableForKeys, true)
      : Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));
    if (allowedApplicableForKeys.length > 0 && (input.applicableFor?.length ?? 0) !== applicableFor.length) {
      return { success: false, error: 'Selected applicable-for values are invalid for this application.' };
    }

    const createdRoleRecord: any = await prisma.$transaction(async (tx) => {
      const created: any = await tx.authzRole.create({
        data: {
          id: roleId,
          name,
          description: input.description?.trim() || null,
          ...(columnSupport.role ? { scopeFor, scopeLevel } : {}),
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          appId: input.appId,
          applicableFor,
        } as any,
        select: columnSupport.role ? {
          id: true,
          name: true,
          description: true,
          scopeFor: true,
          scopeLevel: true,
          acquisitionType: true,
          approvalPolicy: true,
          applicableFor: true,
        } as any : {
          id: true,
          name: true,
          description: true,
          acquisitionType: true,
          approvalPolicy: true,
          applicableFor: true,
        } as any,
      });

      const permissionIds = input.permissionIds ?? [];
      if (permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, permissionIds, { scopeFor, scopeLevel });
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
      roles.find((r) => r.id === createdRoleRecord.id) ?? {
        ...createdRoleRecord,
        scopeFor: getRoleScopeFor(createdRoleRecord),
        scopeLevel: formatRoleScopeLevel(createdRoleRecord.scopeLevel, createdRoleRecord.acquisitionType, createdRoleRecord.approvalPolicy),
        acquisitionType: createdRoleRecord.acquisitionType ?? 'assignment',
        approvalPolicy: createdRoleRecord.approvalPolicy ?? 'none',
        applicableFor: normalizeApplicableFor(createdRoleRecord.applicableFor),
        permissions: [],
      }
    ) as AppRole;

    await dispatchRoleUpdateWebhook({
      appId: input.appId,
      eventType: 'role.updated',
      role: {
        id: fullRole.id,
        name: fullRole.name,
        description: fullRole.description,
        scopeFor: fullRole.scopeFor,
        scopeLevel: fullRole.scopeLevel,
        acquisitionType: fullRole.acquisitionType,
        approvalPolicy: fullRole.approvalPolicy,
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
      const role = await loadManagedRoleRecord(tx, { roleId: input.roleId, appId: input.appId });
      if (!role) throw new Error('Role not found.');

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, input.permissionIds, {
          scopeFor: getRoleScopeFor(role),
          scopeLevel: formatRoleScopeLevel(
            typeof role.scopeLevel === 'string' ? role.scopeLevel : null,
            role.acquisitionType,
            role.approvalPolicy,
          ),
        });
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
  scopeFor?: string[];
  scopeLevel?: string;
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
    const allowedApplicableForKeys = authzConfig.applicableForDefinitions.map(([, key]) => key);
    const applicableFor = allowedApplicableForKeys.length > 0
      ? normalizeConfiguredSelection(input.applicableFor, allowedApplicableForKeys, true)
      : Array.from(new Set((input.applicableFor ?? []).map((item) => item.trim()).filter(Boolean)));
    if (allowedApplicableForKeys.length > 0 && (input.applicableFor?.length ?? 0) !== applicableFor.length) {
      return { success: false, error: 'Selected applicable-for values are invalid for this application.' };
    }

    await prisma.$transaction(async (tx) => {
      const columnSupport = await getAuthzScopePolicyColumnSupport();
      const role = await loadManagedRoleRecord(tx, { roleId: input.roleId, appId: input.appId });
      if (!role) throw new Error('Role not found.');
      const currentScopeFor = validateRoleScopeForInput(getRoleScopeFor(role));
      const currentScopeLevel = formatRoleScopeLevel(
        typeof role.scopeLevel === 'string' ? role.scopeLevel : null,
        role.acquisitionType,
        role.approvalPolicy,
      );
      const nextScopeFor = Array.isArray(input.scopeFor) && input.scopeFor.length > 0
        ? validateRoleScopeForInput(input.scopeFor)
        : currentScopeFor;
      const nextScopeLevel = typeof input.scopeLevel === 'string' && input.scopeLevel.trim().length > 0
        ? validateRoleScopeLevelInput(input.scopeLevel)
        : currentScopeLevel;
      if (typeof input.name === 'string' && input.name.trim() !== role.name) {
        throw new Error('Role title cannot be changed after creation.');
      }

      if (input.permissionIds.length > 0) {
        const selectionError = await validateRolePermissionSelection(tx, input.appId, input.permissionIds, {
          scopeFor: nextScopeFor,
          scopeLevel: nextScopeLevel,
        });
        if (selectionError) throw new Error(selectionError);
      }

      const storedPolicy = getStoredPolicyForScopeLevel(nextScopeLevel);

      await tx.authzRole.update({
        where: { id: input.roleId },
        data: {
          description: input.description?.trim() || null,
          ...(columnSupport.role ? { scopeFor: nextScopeFor, scopeLevel: nextScopeLevel } : {}),
          acquisitionType: storedPolicy.acquisitionType,
          approvalPolicy: storedPolicy.approvalPolicy,
          applicableFor,
        } as any,
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
    if (input.appId === GLOBAL_AUTHZ_APP_ID && isGlobalAuthzSystemRole(input.roleId)) {
      return { success: false, error: 'This system role cannot be deleted.' };
    }

    const rolePayload = await getRolePayload(input.appId, input.roleId);
    const assetGrantCount = await countLegacyAssetGrantRowsForRole(input.roleId);
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
