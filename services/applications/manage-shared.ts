import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { permission } from '@/logica/permission';
import { Prisma } from '@/core/database/prisma';
import prisma from '@/core/database/prisma';
import { getAccountSelectorContext } from '@/services/account/accountSelector';
import { getActiveAccountId, getPersonalAccountId } from '@/services/account/verify';
import { ACCESS_APPLICATION_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { checkPermissions } from '@/services/user';
import { logError } from '@/logica/logger/files';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { activeAccessWhere, cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  APPLICATION_CREATE_PERMISSION,
  ROOT_APPLICATION_BASICS_EDIT_PERMISSION,
  ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION,
  ROOT_APPLICATION_CONFIG_VIEW_PERMISSION,
  ROOT_APPLICATION_DELETE_PERMISSION,
  ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION,
  ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_LOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_ROLES_MANAGE_PERMISSION,
  ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION,
  ROOT_APPLICATION_ROLES_VIEW_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_DELETE_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_ROLE_UPDATE_PERMISSION,
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_REMOVE_PERMISSION,
  ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
  ROOT_APPLICATION_VIEW_PERMISSION,
  APPLICATION_USER_ROLE_ASSIGN_PUBLIC_REQUESTABLE_ROLES_PERMISSION,
  APPLICATION_USER_ROLE_ASSIGN_PUBLIC_ROLES_PERMISSION,
  APPLICATION_USER_ROLE_ASSIGN_ROOT_ROLES_PERMISSION,
  getApplicationPermissionNames,
  type ApplicationPermissionBase,
  type ApplicationPermissionAudience,
} from '@/services/applications/permission-definitions';
import {
  getRoleAccessFlags,
  isRoleDirectlyAssignable,
  roleRequestTarget,
} from '@/services/role-scopes';
import {
  deriveLegacyRoleScopesFromPolicy,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
  roleMatchesAssignmentModesPolicy,
} from '@/services/applications/authz-scope-policy';
import {
  revalidateApplicationConfigRoutes,
  revalidateApplicationDetailRoutes,
  revalidateApplicationEditRoutes,
  revalidateApplicationLogsRoutes,
  revalidateApplicationRequestsRoutes,
  revalidateApplicationUsersRoutes,
} from '@/services/applications/revalidate-routes';
import {
  applicationAccessFields,
  applicationResponseFields,
  applicationTokenFields,
  type Application,
  type ApplicationAccessField,
  type ApplicationEndpointConfig,
  type ApplicationPolicyEntry,
  type ManagedApplication,
  type ApplicationDetailsV2,
  applicationPartyValues,
  type ApplicationParty,
} from '@/services/applications/types';
import {
  buildApplicationId,
  camelCaseApplicationIdSegment,
  generateApplicationIdSuffix,
  isValidApplicationIdPrefix,
  isValidApplicationIdSegment,
  normalizeApplicationIdSegment,
  normalizeApplicationIdPrefix,
} from '@/services/applications/identifiers';
import {
  extractApplicationAuthzConfig,
  normalizeApplicationAuthzDefinitions,
  type ApplicationAuthzConfig,
} from '@/services/applications/authz-config';
import { extractGenderFromDetails, resolveDisplayImage } from '@/logica/display-image';

export const servicePermissions = [
  permission('application.view.root', 'for_individual', 'service'),
  permission('application.create', 'for_individual', 'service'),
  permission('application.create', 'for_dependent', 'service'),
  permission('application.basics.edit.root', 'for_individual', 'service'),
  permission('application.config.view.root', 'for_individual', 'service'),
  permission('application.config.update.root', 'for_individual', 'service'),
  permission('application.delete.root', 'for_individual', 'service'),
  permission('application.logs.view.root', 'for_individual', 'service'),
  permission('application.devlogs.clear.root', 'for_individual', 'service'),
  permission('application.roles.view.root', 'for_individual', 'service'),
  permission('application.roles.manage.root', 'for_individual', 'service'),
  permission('application.roles.resetPush.root', 'for_individual', 'service'),
  permission('application.account.view.root', 'for_individual', 'service'),
  permission('application.account.delete.root', 'for_individual', 'service'),
  permission('application.account.profile.update.root', 'for_individual', 'service'),
  permission('application.account.role.update.root', 'for_individual', 'service'),
  permission('application.account.connection.assign.root', 'for_individual', 'service'),
  permission('application.user.view.root', 'for_individual', 'service'),
  permission('application.user.remove.root', 'for_individual', 'service'),
  permission('application.user.updateBasics.root', 'for_individual', 'service'),
  permission('application.user.updateRole.root', 'for_individual', 'service'),
  permission(APPLICATION_USER_ROLE_ASSIGN_PUBLIC_ROLES_PERMISSION, 'for_individual', 'service'),
  permission(APPLICATION_USER_ROLE_ASSIGN_PUBLIC_REQUESTABLE_ROLES_PERMISSION, 'for_individual', 'service'),
  permission(APPLICATION_USER_ROLE_ASSIGN_ROOT_ROLES_PERMISSION, 'for_individual', 'service'),
];

export const responseAccessSet = new Set<ApplicationAccessField>(applicationResponseFields);
export const tokenFieldSet = new Set<ApplicationAccessField>(applicationTokenFields);
export const ROOT_PERMISSION_SCOPE = 'root.individual';
export const applicationAuthzDefinitionTupleSchema = z.tuple([
  z.string().trim().min(1, 'Name is required.'),
  z.string().trim().min(1, 'Key is required.'),
  z.string().trim(),
]);

export const createApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Application name is required.').max(120, 'Application name is too long.'),
  idPrefix: z.string().trim().min(1, 'Application identifier is required.').max(80, 'Application identifier is too long.'),
  idSuffix: z.string().trim().min(1, 'Application suffix is required.').max(120, 'Application suffix is too long.'),
});

export const saveSecretSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  secretKey: z.string().min(16, 'Secret key is required.'),
});

export const saveAccessSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  access: z.array(z.enum(applicationAccessFields)).default([]),
});

export const policyEntrySchema = z.object({
  name: z.string().trim().min(1, 'Policy name is required.').max(120, 'Policy name is too long.'),
  policy: z.string().trim().min(1, 'Policy content is required.'),
});

export const savePoliciesSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  policies: z.array(policyEntrySchema).default([]),
});

export const saveEndpointsSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  dataDeletionApi: z.string().trim().max(500).optional().or(z.literal('')),
  dataDeletionPage: z.string().trim().max(500).optional().or(z.literal('')),
  accountBlock: z.string().trim().max(4000).optional().or(z.literal('')),
  accountBlockApi: z.string().trim().max(500).optional().or(z.literal('')),
  logoutPage: z.string().trim().max(500).optional().or(z.literal('')),
  logoutApi: z.string().trim().max(500).optional().or(z.literal('')),
});

export const updateApplicationStatusSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  status: z.enum(['development', 'active', 'rejected', 'blocked']),
});

export const ownerRoleKeys = new Set(['application.owner', 'app.owner', 'owner', '*']);
export const APPLICATION_VIEW_BASES: ApplicationPermissionBase[] = [
  'view',
  'basics.edit',
  'config.view',
  'config.update',
  'delete',
  'logs.view',
  'devlogs.view',
  'devlogs.clear',
  'roles.view',
  'roles.manage',
  'roles.resetPush',
  'account.view',
  'account.delete',
  'account.profile.update',
  'account.role.update',
  'account.connection.assign',
  'user.view',
  'user.remove',
  'user.updateBasics',
  'user.updateRole',
];
export const APPLICATION_MUTATION_BASES: ApplicationPermissionBase[] = [
  'basics.edit',
  'config.update',
  'delete',
  'devlogs.clear',
  'roles.manage',
  'roles.resetPush',
  'account.delete',
  'account.profile.update',
  'account.role.update',
  'account.connection.assign',
  'user.remove',
  'user.role.assignPublicRoles',
  'user.role.assignPublicRequestableRoles',
  'user.role.assignRootRoles',
  'user.updateBasics',
  'user.updateRole',
];

export async function hasRootApplicationPermission(permissionName: string): Promise<boolean> {
  const { personalAccountId } = await getAccountSelectorContext();
  if (!personalAccountId) return false;
  return checkPermissions([permissionName], personalAccountId, { roleScope: ROOT_PERMISSION_SCOPE });
}

export async function hasAnyRootApplicationPermission(permissionNames: readonly string[]): Promise<boolean> {
  if (permissionNames.length === 0) return false;

  const results = await Promise.all(
    Array.from(new Set(permissionNames)).map((permissionName) => hasRootApplicationPermission(permissionName)),
  );

  return results.some(Boolean);
}

export async function canCurrentAccountCreateApplication(): Promise<boolean> {
  return checkPermissions([APPLICATION_CREATE_PERMISSION]);
}

export async function resolveApplicationCreateOwnerAccountId(
  requestedOwnerAccountId?: string | null,
): Promise<{ success: true; accountId: string; actorAccountId: string } | { success: false; error: string }> {
  const { activeAccountId, personalAccountId } = await getAccountSelectorContext(requestedOwnerAccountId);
  if (!activeAccountId || !personalAccountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const requested = requestedOwnerAccountId?.trim();
  let ownerAccountId = activeAccountId;
  if (requested && requested !== activeAccountId) {
    const canCreateForOtherAccount = await hasRootApplicationPermission(APPLICATION_CREATE_PERMISSION);
    if (!canCreateForOtherAccount) {
      return { success: false, error: 'Permission denied.' };
    }
    ownerAccountId = requested;
  } else {
    const canCreateForActiveAccount = await canCurrentAccountCreateApplication();
    if (!canCreateForActiveAccount) {
      return { success: false, error: 'Permission denied.' };
    }
  }

  const account = await prisma.account.findUnique({
    where: { id: ownerAccountId },
    select: { accountType: true },
  });

  if (!account || !['individual', 'dependent'].includes(account.accountType)) {
    return { success: false, error: 'Applications can only be created for individual or dependent accounts.' };
  }

  return { success: true, accountId: ownerAccountId, actorAccountId: personalAccountId };
}

export async function reserveAvailableApplicationId(
  tx: Prisma.TransactionClient,
  idPrefix: string,
  requestedSuffix: string,
): Promise<{ appId: string; resolvedSuffix: string; appendedRandom: boolean }> {
  const normalizedPrefix = normalizeApplicationIdPrefix(idPrefix.trim());
  const normalizedBaseSuffix = normalizeApplicationIdSegment(requestedSuffix.trim());
  if (!normalizedPrefix || !normalizedBaseSuffix) {
    throw new Error('Application identifier parts are required.');
  }

  const attemptedSuffixes = new Set<string>();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nextSuffix =
      attempt === 0 ? normalizedBaseSuffix : `${normalizedBaseSuffix}${generateApplicationIdSuffix()}`;
    if (attemptedSuffixes.has(nextSuffix)) continue;
    attemptedSuffixes.add(nextSuffix);

    const nextId = buildApplicationId(normalizedPrefix, nextSuffix);
    const existing = await tx.application.findUnique({
      where: { id: nextId },
      select: { id: true },
    });
    if (existing) continue;

    return {
      appId: nextId,
      resolvedSuffix: nextSuffix,
      appendedRandom: attempt > 0,
    };
  }

  throw new Error('Could not reserve a unique application identifier.');
}

export async function resolveAvailableApplicationId(input: {
  idPrefix: string;
  name?: string;
  customSuffix?: string;
}): Promise<{
  success: boolean;
  appId?: string;
  resolvedSuffix?: string;
  usedCustomSuffix?: boolean;
  error?: string;
}> {
  const canCreateApplication = await canCurrentAccountCreateApplication();
  if (!canCreateApplication) {
    return { success: false, error: 'Permission denied.' };
  }

  const normalizedIdPrefix = normalizeApplicationIdPrefix(input.idPrefix.trim());
  if (!normalizedIdPrefix || !isValidApplicationIdPrefix(normalizedIdPrefix)) {
    return { success: false, error: 'Application identifier may only contain letters and numbers.' };
  }

  const baseSuffix = input.customSuffix?.trim()
    ? normalizeApplicationIdSegment(input.customSuffix)
    : camelCaseApplicationIdSegment(input.name ?? '');
  if (!baseSuffix || !isValidApplicationIdSegment(baseSuffix)) {
    return { success: false, error: 'Application ID suffix may only contain letters and numbers.' };
  }

  try {
    const resolved = await prisma.$transaction((tx) =>
      reserveAvailableApplicationId(tx, normalizedIdPrefix, baseSuffix),
    );

    return {
      success: true,
      appId: resolved.appId,
      resolvedSuffix: resolved.resolvedSuffix,
      usedCustomSuffix: Boolean(input.customSuffix?.trim()),
    };
  } catch (error) {
    await logError('database', error, `resolveAvailableApplicationId:${normalizedIdPrefix}:${baseSuffix}`);
    return { success: false, error: 'Could not resolve an application identifier.' };
  }
}

export async function canCurrentAccountUseRootApplicationMode(
  additionalPermissionNames: readonly string[] = [],
): Promise<boolean> {
  return hasAnyRootApplicationPermission([
    ROOT_APPLICATION_VIEW_PERMISSION,
    ...additionalPermissionNames,
  ]);
}

export async function canAccessRootApplicationMode(
  rootMode?: boolean,
  additionalPermissionNames: readonly string[] = [],
): Promise<boolean> {
  if (!rootMode) return true;
  return canCurrentAccountUseRootApplicationMode(additionalPermissionNames);
}

export function extractPermissionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];

  for (const item of raw) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      if (typeof record.name === 'string') out.push(record.name);
    }
  }

  return out;
}

export function hasAnyPermissionName(granted: Set<string>, permissionNames: readonly string[]): boolean {
  return permissionNames.some((permissionName) => granted.has(permissionName));
}

export function resolveApplicationPermissionAudience(
  activeAccountId: string,
  personalAccountId: string | null,
): ApplicationPermissionAudience {
  return personalAccountId && activeAccountId === personalAccountId ? 'public' : 'managed';
}

export async function getCurrentScopedApplicationPermissionNames(
  activeAccountId: string,
  bases: readonly ApplicationPermissionBase[],
): Promise<string[]> {
  const personalAccountId = await getPersonalAccountId();
  const audience = resolveApplicationPermissionAudience(activeAccountId, personalAccountId);
  return getApplicationPermissionNames(bases, [audience]);
}

export async function canCurrentAccountAccessApplicationByBase(
  appId: string,
  appBases: readonly ApplicationPermissionBase[],
  rootPermissionName: string,
  fallbackRootPermissionName?: string,
  options?: { rootMode?: boolean },
): Promise<boolean> {
  const accountId = await getActiveAccountId();
  if (!accountId) return false;

  const [hasRootPermission, permissionNames] = await Promise.all([
    options?.rootMode === true && fallbackRootPermissionName
      ? Promise.all([
          hasRootApplicationPermission(rootPermissionName),
          hasRootApplicationPermission(fallbackRootPermissionName),
        ]).then((results) => results.some(Boolean))
      : options?.rootMode === true
        ? hasRootApplicationPermission(rootPermissionName)
        : Promise.resolve(false),
    getCurrentScopedApplicationPermissionNames(accountId, appBases),
  ]);

  if (hasRootPermission) return true;
  return hasApplicationPermission(accountId, appId, permissionNames);
}

/**
 * Function normalizeText.
 */
export function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Function normalizeAccess.
 */
export function normalizeAccess(value: unknown): ApplicationAccessField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is ApplicationAccessField =>
    typeof entry === 'string' && (applicationAccessFields as readonly string[]).includes(entry)
  );
}

/**
 * Function normalizePolicies.
 */
export function normalizePolicies(value: unknown): ApplicationPolicyEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  // Handle legacy array shape: { name, policy }
  const legacy = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = normalizeText(record.name);
      const policy = normalizeText(record.policy);
      if (!name || !policy) return null;
      return { name, policy };
    })
    .filter((e): e is ApplicationPolicyEntry => e !== null);

  if (legacy.length > 0) return legacy;

  // Handle relational ApplicationPolicy shape: { policyType, policyValue }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = normalizeText(record.policyType ?? record.name);
      const policyVal = record.policyValue ?? record.policy;
      const policy = typeof policyVal === 'string' ? policyVal : JSON.stringify(policyVal);
      const policyText = normalizeText(policy);
      if (!name || !policyText) return null;
      return { name, policy: policyText };
    })
    .filter((e): e is ApplicationPolicyEntry => e !== null);
}

/**
 * Function normalizeEndpoints.
 */
export function normalizeEndpoints(value: unknown): ApplicationEndpointConfig {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    dataDeletionApi: normalizeText(record.dataDeletionApi),
    dataDeletionPage: normalizeText(record.dataDeletionPage),
    accountBlock: normalizeText(record.accountBlock),
    accountBlockApi: normalizeText(record.accountBlockApi),
    logoutPage: normalizeText(record.logoutPage),
    logoutApi: normalizeText(record.logoutApi),
  };
}

export async function getApplicationRoleGrantsForAccount(accountId: string, appId: string): Promise<Array<{ roleId: string; roleName: string | null; permissions: unknown }>> {
  const accessRows = await prisma.access.findMany({
    where: {
      memberAccountId: accountId,
      accessApplicationId: appId,
      ...activeAccessWhere(),
    },
    select: {
      roleId: true,
      role: { select: { name: true, permissions: true } },
    },
  });

  return accessRows.map((row) => ({
    roleId: row.roleId,
    roleName: row.role.name,
    permissions: row.role.permissions,
  }));
}

/**
 * Function resolveApplicationAccessForAccount.
 */
export async function resolveApplicationAccessForAccount(accountId: string, appId: string): Promise<{ canView: boolean; canEdit: boolean }> {
  try {
    const roleRows = await getApplicationRoleGrantsForAccount(accountId, appId);

    if (roleRows.length === 0) {
      return { canView: false, canEdit: false };
    }

    const grantedPermissions = new Set(roleRows.flatMap((row) => extractPermissionNames(row.permissions)));
    const permissionDrivenEdit = hasAnyPermissionName(
      grantedPermissions,
      getApplicationPermissionNames(APPLICATION_MUTATION_BASES, ['public', 'managed']),
    );
    const permissionDrivenView = hasAnyPermissionName(
      grantedPermissions,
      getApplicationPermissionNames(APPLICATION_VIEW_BASES, ['public', 'managed']),
    );
    const isOwner = roleRows.some((row) => ownerRoleKeys.has(row.roleId.trim().toLowerCase()));
    const canEdit = permissionDrivenEdit || isOwner;
    const canView = canEdit || permissionDrivenView || isOwner;

    return { canView, canEdit };
  } catch (error) {
    await logError('database', error, `resolveApplicationAccessForAccount:${accountId}:${appId}`);
    return { canView: false, canEdit: false };
  }
}

export async function hasApplicationPermission(
  accountId: string,
  appId: string,
  permissionNames: string[],
): Promise<boolean> {
  if (permissionNames.length === 0) return false;

  const grants = await getApplicationRoleGrantsForAccount(accountId, appId);

  const granted = new Set(
    grants.flatMap((g) => extractPermissionNames(g.permissions))
  );

  return permissionNames.some((permission) => granted.has(permission));
}

/**
 * Function getApplicationAuthorization.
 */
export async function getApplicationAuthorization(accountId: string, appId: string): Promise<{ exists: boolean; canView: boolean; canEdit: boolean }> {
  const application = await prisma.application.findUnique({ where: { id: appId }, select: { id: true } });
  if (!application) return { exists: false, canView: false, canEdit: false };

  const access = await resolveApplicationAccessForAccount(accountId, appId);
  return { exists: true, canView: access.canView, canEdit: access.canEdit };
}

/**
 * Function isApplicationOwnerForAccount.
 */
export async function isApplicationOwnerForAccount(accountId: string, appId: string): Promise<boolean> {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true },
  });

  if (!app) return false;

  const ownerRoleRows = await getApplicationRoleGrantsForAccount(accountId, appId);

  return ownerRoleRows.some((row) => ownerRoleKeys.has(row.roleId.trim().toLowerCase()));
}

export type ApplicationRootModeOption = { rootMode?: boolean };
