'use server';

import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { permission } from '@/logica/permission';
import { Prisma } from '@/prisma/generated/client/client';
import prisma from '@/core/helpers/prisma';
import { getAccountSelectorContext } from '@/logica/account/accountSelector';
import { getActiveAccountId, getPersonalAccountId } from '@/logica/account/verify';
import { ACCESS_APPLICATION_VIEW_PERMISSIONS } from '@/logica/account/access-view-permissions';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { activeAccessWhere, cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_BASICS_EDIT_PERMISSION,
  ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION,
  ROOT_APPLICATION_CONFIG_VIEW_PERMISSION,
  ROOT_APPLICATION_CREATE_PERMISSION,
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
  getApplicationPermissionNames,
  type ApplicationPermissionBase,
  type ApplicationPermissionAudience,
} from '@/services/applications/permission-definitions';
import {
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

const servicePermissions = [
  permission('application.view.root', 'for_individual', 'service'),
  permission('application.create.root', 'for_individual', 'service'),
  permission('application.basics.edit.root', 'for_individual', 'service'),
  permission('application.config.view.root', 'for_individual', 'service'),
  permission('application.config.update.root', 'for_individual', 'service'),
  permission('application.delete.root', 'for_individual', 'service'),
  permission('application.logs.view.root', 'for_individual', 'service'),
  permission('application.devlogs.view.root', 'for_individual', 'service'),
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
];

const responseAccessSet = new Set<ApplicationAccessField>(applicationResponseFields);
const tokenFieldSet = new Set<ApplicationAccessField>(applicationTokenFields);
const ROOT_PERMISSION_SCOPE = 'root.individual';
const applicationAuthzDefinitionTupleSchema = z.tuple([
  z.string().trim().min(1, 'Name is required.'),
  z.string().trim().min(1, 'Key is required.'),
  z.string().trim(),
]);

const createApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Application name is required.').max(120, 'Application name is too long.'),
  idPrefix: z.string().trim().min(1, 'Application identifier is required.').max(80, 'Application identifier is too long.'),
  idSuffix: z.string().trim().min(1, 'Application suffix is required.').max(120, 'Application suffix is too long.'),
});

const saveSecretSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  secretKey: z.string().min(16, 'Secret key is required.'),
});

const saveAccessSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  access: z.array(z.enum(applicationAccessFields)).default([]),
});

const policyEntrySchema = z.object({
  name: z.string().trim().min(1, 'Policy name is required.').max(120, 'Policy name is too long.'),
  policy: z.string().trim().min(1, 'Policy content is required.'),
});

const savePoliciesSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  policies: z.array(policyEntrySchema).default([]),
});

const saveEndpointsSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  dataDeletionApi: z.string().trim().max(500).optional().or(z.literal('')),
  dataDeletionPage: z.string().trim().max(500).optional().or(z.literal('')),
  accountBlock: z.string().trim().max(4000).optional().or(z.literal('')),
  accountBlockApi: z.string().trim().max(500).optional().or(z.literal('')),
  logoutPage: z.string().trim().max(500).optional().or(z.literal('')),
  logoutApi: z.string().trim().max(500).optional().or(z.literal('')),
});

const updateApplicationStatusSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  status: z.enum(['development', 'active', 'rejected', 'blocked']),
});

const ownerRoleKeys = new Set(['application.owner', 'app.owner', 'owner', '*']);
const APPLICATION_VIEW_BASES: ApplicationPermissionBase[] = [
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
const APPLICATION_MUTATION_BASES: ApplicationPermissionBase[] = [
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
  'user.updateBasics',
  'user.updateRole',
];

export async function hasRootApplicationPermission(permissionName: string): Promise<boolean> {
  const { personalAccountId } = await getAccountSelectorContext();
  if (!personalAccountId) return false;
  return checkPermissions([permissionName], personalAccountId, { roleScope: ROOT_PERMISSION_SCOPE });
}

async function hasAnyRootApplicationPermission(permissionNames: readonly string[]): Promise<boolean> {
  if (permissionNames.length === 0) return false;

  const results = await Promise.all(
    Array.from(new Set(permissionNames)).map((permissionName) => hasRootApplicationPermission(permissionName)),
  );

  return results.some(Boolean);
}

async function canCurrentAccountCreateApplication(): Promise<boolean> {
  return hasRootApplicationPermission(ROOT_APPLICATION_CREATE_PERMISSION);
}

async function reserveAvailableApplicationId(
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

async function canAccessRootApplicationMode(
  rootMode?: boolean,
  additionalPermissionNames: readonly string[] = [],
): Promise<boolean> {
  if (!rootMode) return true;
  return canCurrentAccountUseRootApplicationMode(additionalPermissionNames);
}

function extractPermissionNames(raw: unknown): string[] {
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

function hasAnyPermissionName(granted: Set<string>, permissionNames: readonly string[]): boolean {
  return permissionNames.some((permissionName) => granted.has(permissionName));
}

function resolveApplicationPermissionAudience(
  activeAccountId: string,
  personalAccountId: string | null,
): ApplicationPermissionAudience {
  return personalAccountId && activeAccountId === personalAccountId ? 'public' : 'managed';
}

async function getCurrentScopedApplicationPermissionNames(
  activeAccountId: string,
  bases: readonly ApplicationPermissionBase[],
): Promise<string[]> {
  const personalAccountId = await getPersonalAccountId();
  const audience = resolveApplicationPermissionAudience(activeAccountId, personalAccountId);
  return getApplicationPermissionNames(bases, [audience]);
}

async function canCurrentAccountAccessApplicationByBase(
  appId: string,
  appBases: readonly ApplicationPermissionBase[],
  rootPermissionName: string,
  fallbackRootPermissionName?: string,
): Promise<boolean> {
  const accountId = await getActiveAccountId();
  if (!accountId) return false;

  const [hasRootPermission, permissionNames] = await Promise.all([
    fallbackRootPermissionName
      ? Promise.all([
          hasRootApplicationPermission(rootPermissionName),
          hasRootApplicationPermission(fallbackRootPermissionName),
        ]).then((results) => results.some(Boolean))
      : hasRootApplicationPermission(rootPermissionName),
    getCurrentScopedApplicationPermissionNames(accountId, appBases),
  ]);

  if (hasRootPermission) return true;
  return hasApplicationPermission(accountId, appId, permissionNames);
}

/**
 * Function normalizeText.
 */
function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}


/**
 * Function normalizeAccess.
 */
function normalizeAccess(value: unknown): ApplicationAccessField[] {
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
function normalizePolicies(value: unknown): ApplicationPolicyEntry[] {
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
function normalizeEndpoints(value: unknown): ApplicationEndpointConfig {
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

async function getApplicationRoleGrantsForAccount(accountId: string, appId: string): Promise<Array<{ roleId: string; roleName: string | null; permissions: unknown }>> {
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
async function resolveApplicationAccessForAccount(accountId: string, appId: string): Promise<{ canView: boolean; canEdit: boolean }> {
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

async function hasApplicationPermission(
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
async function getApplicationAuthorization(accountId: string, appId: string): Promise<{ exists: boolean; canView: boolean; canEdit: boolean }> {
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


/**
 * Type ApplicationDetailsForViewer.
 */
export type ApplicationDetailsForViewer = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  configuredAccess: ApplicationAccessField[];
  accessedData: string[];
  hasUsedApp: boolean;
  policies: ApplicationPolicyEntry[];
  endpoints: ApplicationEndpointConfig;
  canDelete: boolean;
};


/**
 * Function getApplicationDetailsForViewer.
 */
export async function getApplicationDetailsForViewer(appId: string): Promise<ApplicationDetailsForViewer | null> {
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) return null;

  const personalAccountId = await getPersonalAccountId();
  const deletePermissionNames = await getCurrentScopedApplicationPermissionNames(activeAccountId, ['delete']);

  try {
    const authorization = await getApplicationAuthorization(activeAccountId, appId);
    if (!authorization.exists || !authorization.canView) return null;

    const [application, appSessions, canDelete] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          responseFields: true,
          policies: true,
          endpoints: true,
        },
      }),
      personalAccountId
        ? getApplicationRoleGrantsForAccount(personalAccountId, appId)
        : [],
      hasApplicationPermission(activeAccountId, appId, deletePermissionNames),
    ]);

    if (!application) return null;

    const configuredAccess = normalizeAccess(application.responseFields).filter((field) => responseAccessSet.has(field));
    const policies = normalizePolicies(application.policies);
    const endpoints = normalizeEndpoints(application.endpoints);

    const accessedData = Array.from(
      new Set(
        appSessions.map((row) => row.roleId)
      )
    );

    return {
      id: application.id,
      name: application.name,
      description: application.description || undefined,
      icon: application.icon || undefined,
      configuredAccess,
      accessedData,
      hasUsedApp: appSessions.length > 0,
      policies,
      endpoints,
      canDelete,
    };
  } catch (error) {
    await logError('database', error, `getApplicationDetailsForViewer:${appId}`);
    return null;
  }
}


/**
 * Function deleteManagedApplication.
 */
export async function deleteManagedApplication(appId: string): Promise<{ success: boolean; error?: string }> {
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const [deletePermissionNames, isRootDeleter] = await Promise.all([
      getCurrentScopedApplicationPermissionNames(activeAccountId, ['delete']),
      hasRootApplicationPermission(ROOT_APPLICATION_DELETE_PERMISSION),
    ]);
    const canDelete = isRootDeleter || await hasApplicationPermission(activeAccountId, appId, deletePermissionNames);
    if (!canDelete) {
      return { success: false, error: 'You do not have permission to delete this application.' };
    }

    await prisma.application.delete({
      where: { id: appId },
    });

    revalidatePath('/application');
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteManagedApplication:${appId}`);
    return { success: false, error: 'Failed to delete application.' };
  }
}


/**
 * Function createManagedApplication.
 */
export async function createManagedApplication(input: { name: string; idPrefix: string; idSuffix: string }) {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application details.' };
  }

  const normalizedIdPrefix = normalizeApplicationIdPrefix(parsed.data.idPrefix);
  if (!normalizedIdPrefix || !isValidApplicationIdPrefix(normalizedIdPrefix)) {
    return { success: false, error: 'Application identifier may only contain letters and numbers.' };
  }

  const canCreateApplication = await canCurrentAccountCreateApplication();
  if (!canCreateApplication) {
    return { success: false, error: 'Permission denied.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      // Ensure the application.owner role and its permissions exist before creating grants.
      // This makes createManagedApplication self-contained regardless of seed state.
      const permissionDefinitions = APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS.map((permission, index) => ({
        id: `cap-appowner-${index + 1}-${permission.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`,
        ...permission,
      }));
      const permissions: Array<{ id: string; name: string; description: string | null }> = [];
      for (const cap of permissionDefinitions) {
        const permission = await tx.authzPermission.upsert({
          where: { name_appId: { name: cap.name, appId: 'neup.account' } },
          update: { name: cap.name, description: cap.description, appId: 'neup.account' },
          create: { id: cap.id, name: cap.name, description: cap.description, appId: 'neup.account' },
          select: { id: true, name: true, description: true },
        });
        permissions.push(permission);
      }
      await tx.authzRole.upsert({
        where: { id: 'application.owner' },
        update: {
          name: 'application.owner',
          description: 'Full ownership of an application.',
          appId: 'neup.account',
          scopeFor: ['for_individual'],
          scopeLevel: 'selfAssigned',
        },
        create: {
          id: 'application.owner',
          name: 'application.owner',
          description: 'Full ownership of an application.',
          appId: 'neup.account',
          scopeFor: ['for_individual'],
          scopeLevel: 'selfAssigned',
        },
      });
      await tx.authzRolePermissionMap.deleteMany({
        where: { roleId: 'application.owner' },
      });
      await tx.authzRolePermissionMap.createMany({
        data: permissions.map((cap) => ({
          roleId: 'application.owner',
          permissionId: cap.id,
          scopeFor: 'for_individual',
          scopeLevel: 'selfAssigned',
        })),
        skipDuplicates: true,
      });
      await tx.authzRole.update({
        where: { id: 'application.owner' },
        data: {
          permissions: permissions.map((permission) => permission.name),
        },
      });
      const reservedId = await reserveAvailableApplicationId(tx, normalizedIdPrefix, parsed.data.idSuffix);
      const applicationId = reservedId.appId;

      const createdApp = await tx.application.create({
        data: {
          id: applicationId,
          name: parsed.data.name,
          status: 'development',
        },
        select: {
          id: true,
          name: true,
        },
      });

      await ensureAccessGrant(tx, {
        memberAccountId: accountId,
        parentAccountId: accountId,
        childApplicationId: createdApp.id,
        accessApplicationId: createdApp.id,
        roleId: 'application.owner',
        details: {
          permissions: permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            description: permission.description ?? null,
          })),
        },
      });

      return { id: createdApp.id };
    });

    await logActivity(accountId, activityAction.applicationCreated(application.id), 'Success');

    revalidatePath('/application');
    return { success: true, appId: application.id };
  } catch (error) {
    await logError('database', error, 'createManagedApplication');
    return { success: false, error: 'Failed to create application.' };
  }
}


/**
 * Function getManagedApplications.
 */
export async function getManagedApplications(): Promise<Array<{ id: string; name: string; slug?: string; icon?: string; createdAt: Date; hasSecretKey: boolean; status?: string }>> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return [];
  }

  const permissionNames = await getCurrentScopedApplicationPermissionNames(accountId, APPLICATION_VIEW_BASES);

  try {
    const accessRows = await prisma.access.findMany({
      where: {
        memberAccountId: accountId,
        assetApplicationId: { not: null },
        ...activeAccessWhere(),
      },
      orderBy: { id: 'desc' },
      select: {
        roleId: true,
        assetApplicationId: true,
        role: { select: { name: true, permissions: true } },
      },
    });

    const ownedIds = new Set<string>();
    const permittedViewAppIds = new Set<string>();

    for (const row of accessRows) {
      const appId = row.assetApplicationId;
      if (!appId) continue;

      const normalizedCandidates = [row.roleId, row.role.name]
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().toLowerCase());
      const grantedPermissions = new Set(extractPermissionNames(row.role.permissions));

      const isOwner = normalizedCandidates.some((role) => ownerRoleKeys.has(role));
      const canView = isOwner || hasAnyPermissionName(grantedPermissions, permissionNames);

      if (canView) permittedViewAppIds.add(appId);
      if (isOwner) ownedIds.add(appId);
    }

    const ownedApplications = ownedIds.size
      ? await prisma.application.findMany({
          where: {
            id: { in: Array.from(ownedIds) },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
            appSecret: true,
            status: true,
          },
        })
      : [];

    const permittedApplications = permittedViewAppIds.size
      ? await prisma.application.findMany({
          where: {
            id: { in: Array.from(permittedViewAppIds) },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
            appSecret: true,
            status: true,
          },
        })
      : [];

    const applications = [
      ...ownedApplications,
      ...permittedApplications.filter((app) => !ownedIds.has(app.id)),
    ];

    return applications.map((application) => ({
      id: application.id,
      name: application.name,
      icon: application.icon || undefined,
      createdAt: application.createdAt,
      hasSecretKey: Boolean(application.appSecret),
      status: application.status || undefined,
    }));
  } catch (error) {
    await logError('database', error, 'getManagedApplications');
    return [];
  }
}


/**
 * Function getManagedApplication.
 */
export async function getManagedApplication(appId: string): Promise<ManagedApplication | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return null;
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, appId);
    if (!authorization.exists || !authorization.canView) {
      return null;
    }

    const [application, authzWebhookRecord] = await Promise.all([
      prisma.application.findFirst({
        where: { id: appId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          appSecret: true,
          responseFields: true,
          details: true,
          policies: true,
          endpoints: true,
        },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'authzWebhook' },
        select: { value: true },
      }),
    ]);

    if (!application) {
      return null;
    }

    return {
      id: application.id,
      name: application.name,
      createdAt: application.createdAt,
      hasSecretKey: Boolean(application.appSecret),
      access: normalizeAccess(
        application.responseFields.length > 0
          ? application.responseFields
          : (application as any).details?.access ?? [],
      ).filter((field) => responseAccessSet.has(field)),
      policies: normalizePolicies(application.policies),
      endpoints: normalizeEndpoints(application.endpoints),
      authzWebhookUrl: authzWebhookRecord?.value ?? null,
    };
  } catch (error) {
    await logError('database', error, `getManagedApplication:${appId}`);
    return null;
  }
}


/**
 * Function saveApplicationSecret.
 */
export async function saveApplicationSecret(input: { appId: string; secretKey: string }) {
  const parsed = saveSecretSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid secret key.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(parsed.data.appId);
  if (!canUpdateConfig) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }

    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        appSecret: parsed.data.secretKey,
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidateApplicationDetailRoutes(parsed.data.appId);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationSecret:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save secret key.' };
  }
}


/**
 * Function saveApplicationAccess.
 */
export async function saveApplicationAccess(input: { appId: string; access: ApplicationAccessField[] }) {
  const parsed = saveAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid access list.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(parsed.data.appId);
  if (!canUpdateConfig) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }

    const sanitizedAccess = parsed.data.access.filter((field) => responseAccessSet.has(field));

    const existing = await prisma.application.findUnique({
      where: { id: parsed.data.appId },
      select: { details: true },
    });

    const existingDetails =
      existing?.details && typeof existing.details === 'object'
        ? (existing.details as Record<string, unknown>)
        : {};

    const result = await prisma.application.updateMany({
      where: { id: parsed.data.appId },
      data: { responseFields: sanitizedAccess, details: { ...existingDetails, access: sanitizedAccess } },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidateApplicationDetailRoutes(parsed.data.appId);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationAccess:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save access list.' };
  }
}


/**
 * Function saveApplicationPolicies.
 */
export async function saveApplicationPolicies(input: { appId: string; policies: ApplicationPolicyEntry[] }) {
  const parsed = savePoliciesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid policies.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(parsed.data.appId);
  if (!canUpdateConfig) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.applicationPolicy.deleteMany({ where: { appId: parsed.data.appId } });
      if (parsed.data.policies.length > 0) {
        await tx.applicationPolicy.createMany({
          data: parsed.data.policies.map((p) => ({
            appId: parsed.data.appId,
            policyType: p.name,
            policyValue: p.policy,
          })),
        });
      }
    });

    revalidateApplicationDetailRoutes(parsed.data.appId);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationPolicies:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save policies.' };
  }
}


/**
 * Function saveApplicationEndpoints.
 */
export async function saveApplicationEndpoints(input: { appId: string } & ApplicationEndpointConfig) {
  const parsed = saveEndpointsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid endpoint information.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(parsed.data.appId);
  if (!canUpdateConfig) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }

    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        endpoints: {
          dataDeletionApi: normalizeText(parsed.data.dataDeletionApi),
          dataDeletionPage: normalizeText(parsed.data.dataDeletionPage),
          accountBlock: normalizeText(parsed.data.accountBlock),
          accountBlockApi: normalizeText(parsed.data.accountBlockApi),
          logoutPage: normalizeText(parsed.data.logoutPage),
          logoutApi: normalizeText(parsed.data.logoutApi),
        },
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidateApplicationDetailRoutes(parsed.data.appId);

    return { success: true };
  } catch (error) {
    await logError('database', error, `saveApplicationEndpoints:${parsed.data.appId}`);
    return { success: false, error: 'Failed to save endpoint information.' };
  }
}


/**
 * Function updateManagedApplicationStatus.
 */
export async function updateManagedApplicationStatus(input: { appId: string; status: 'development' | 'active' | 'rejected' | 'blocked' }) {
  const parsed = updateApplicationStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application status.' };
  }

  const [isRootAppManager, isBrandManager] = await Promise.all([
    hasRootApplicationPermission(ROOT_APPLICATION_BASICS_EDIT_PERMISSION),
    checkPermissions(['linked_accounts.brand.manager']),
  ]);
  if (!isRootAppManager && !isBrandManager) {
    notFound();
  }
  if (!isRootAppManager && !isBrandManager) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const result = await prisma.application.updateMany({
      where: {
        id: parsed.data.appId,
      },
      data: {
        status: parsed.data.status,
      },
    });

    if (result.count === 0) {
      return { success: false, error: 'Application not found.' };
    }

    revalidatePath('/manage/applications');
    revalidateApplicationDetailRoutes(parsed.data.appId);

    return { success: true };
  } catch (error) {
    await logError('database', error, `updateManagedApplicationStatus:${parsed.data.appId}`);
    return { success: false, error: 'Failed to update application status.' };
  }
}

// Returns all applications, optionally filtered by a search query.
export async function getApps(searchQuery?: string): Promise<Application[]> {
    try {
        const apps = await prisma.application.findMany({
            where: searchQuery ? {
                OR: [
                    { name: { contains: searchQuery, mode: 'insensitive' } },
                    { id: { contains: searchQuery, mode: 'insensitive' } },
                    { description: { contains: searchQuery, mode: 'insensitive' } },
                ],
            } : {},
            orderBy: { createdAt: 'desc' }
        });

        return apps.map(app => {
            const { appSecret, ...data } = app;
            return { ...data } as unknown as Application;
        });
    } catch (error) {
        await logError('database', error, 'getApps');
        return [];
    }
}

// Returns a single application by ID, stripping the secret key.
export async function getAppDetails(appId: string): Promise<Application | null> {
    try {
        const app = await prisma.application.findUnique({ where: { id: appId } });
        if (app) {
            const { appSecret, ...data } = app;
            return { ...data } as unknown as Application;
        }
        return null;
    } catch (error) {
        await logError('database', error, `getApplicationDetails: ${appId}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Silent SSO Origins
// ---------------------------------------------------------------------------

/**
 * Returns all registered silentSsoOrigin entries for an application.
 */
export async function getSilentSsoOrigins(
  appId: string
): Promise<Array<{ id: string; value: string }>> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    const authorization = await getApplicationAuthorization(accountId, appId);
    if (!authorization.exists || !authorization.canView) return [];

    const records = await prisma.applicationBridge.findMany({
      where: { appId, type: 'silentSsoOrigin' },
      select: { id: true, value: true },
      orderBy: { createdAt: 'asc' },
    });

    return records;
  } catch (error) {
    await logError('database', error, `getSilentSsoOrigins:${appId}`);
    return [];
  }
}

/**
 * Adds a new silentSsoOrigin entry for an application.
 * The origin must be a valid HTTPS URL.
 */
export async function addSilentSsoOrigin(input: {
  appId: string;
  origin: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  // Validate origin is a valid HTTPS URL
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(input.origin);
  } catch {
    return { success: false, error: 'Invalid URL.' };
  }

  if (parsedOrigin.protocol !== 'https:') {
    return { success: false, error: 'Origin must use HTTPS.' };
  }

  // Normalize to scheme + host only
  const normalizedOrigin = parsedOrigin.origin;
  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canUpdateConfig) return { success: false, error: 'Permission denied.' };

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };

    // Prevent duplicates
    const existing = await prisma.applicationBridge.findFirst({
      where: { appId: input.appId, type: 'silentSsoOrigin', value: normalizedOrigin },
    });
    if (existing) return { success: false, error: 'This origin is already registered.' };

    await prisma.applicationBridge.create({
      data: {
        appId: input.appId,
        type: 'silentSsoOrigin',
        value: normalizedOrigin,
      },
    });

    revalidateApplicationDetailRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addSilentSsoOrigin:${input.appId}`);
    return { success: false, error: 'Failed to add origin.' };
  }
}

/**
 * Removes a silentSsoOrigin entry for an application.
 */
export async function removeSilentSsoOrigin(input: {
  appId: string;
  bridgeId: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canUpdateConfig) return { success: false, error: 'Permission denied.' };

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };

    await prisma.applicationBridge.deleteMany({
      where: { id: input.bridgeId, appId: input.appId, type: 'silentSsoOrigin' },
    });

    revalidateApplicationDetailRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeSilentSsoOrigin:${input.appId}`);
    return { success: false, error: 'Failed to remove origin.' };
  }
}

// ---------------------------------------------------------------------------
// Server IPs
// ---------------------------------------------------------------------------

function isValidIpAddress(value: string): boolean {
  return isIP(value) !== 0;
}

/**
 * Adds a server IP entry for an application.
 */
export async function addServerIp(input: {
  appId: string;
  ip: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const normalizedIp = input.ip.trim().toLowerCase();
  if (!normalizedIp || !isValidIpAddress(normalizedIp)) {
    return { success: false, error: 'Invalid IP address.' };
  }

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canUpdateConfig) return { success: false, error: 'Permission denied.' };

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };

    const existing = await prisma.applicationBridge.findFirst({
      where: { appId: input.appId, type: 'serverIp', value: normalizedIp },
    });
    if (existing) return { success: false, error: 'This IP is already registered.' };

    await prisma.applicationBridge.create({
      data: {
        appId: input.appId,
        type: 'serverIp',
        value: normalizedIp,
      },
    });

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addServerIp:${input.appId}`);
    return { success: false, error: 'Failed to add server IP.' };
  }
}

/**
 * Removes a server IP entry for an application.
 */
export async function removeServerIp(input: {
  appId: string;
  bridgeId: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canUpdateConfig = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canUpdateConfig) return { success: false, error: 'Permission denied.' };

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };

    await prisma.applicationBridge.deleteMany({
      where: { id: input.bridgeId, appId: input.appId, type: 'serverIp' },
    });

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeServerIp:${input.appId}`);
    return { success: false, error: 'Failed to remove server IP.' };
  }
}


/**
 * Function getApplicationDetailsForViewerV2.
 *
 * Role-aware detail loader. Root users with the scoped root application view permission can view any application.
 * Regular users can view apps they have an member for OR an
 * ApplicationConnection to. appSecret is never returned.
 */
export async function getApplicationDetailsForViewerV2(
  appId: string,
  options?: { rootMode?: boolean; rootPermissionNames?: readonly string[] },
): Promise<ApplicationDetailsV2 | null> {
  const rootPermissionNames = options?.rootPermissionNames ?? [];
  const [isRootViewer, canUseRootMode] = await Promise.all([
    hasAnyRootApplicationPermission([ROOT_APPLICATION_VIEW_PERMISSION, ...rootPermissionNames]),
    canAccessRootApplicationMode(options?.rootMode, rootPermissionNames),
  ]);
  if (!canUseRootMode) return null;

  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) return null;

  const personalAccountId = await getPersonalAccountId();
  const deletePermissionNames = await getCurrentScopedApplicationPermissionNames(activeAccountId, ['delete']);

  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        website: true,
        status: true,
        isInternal: true,
        responseFields: true,
        policies: true,
        endpoints: true,
      },
    });

    if (!application) return null;

    // Non-root users must have explicit access
    if (!isRootViewer) {
      const access = await resolveApplicationAccessForAccount(activeAccountId, appId);
      // Also allow if they have an ApplicationConnection
      const connection = personalAccountId
        ? await prisma.connection.findUnique({
            where: { accountId_appId: { accountId: personalAccountId, appId } },
            select: { accountId: true },
          })
        : null;
      if (!access.canView && !connection) return null;
    }

    // Fetch connection info for the personal account
    const connectionRow = personalAccountId
      ? await prisma.connection.findUnique({
          where: { accountId_appId: { accountId: personalAccountId, appId } },
          select: { connectedAt: true },
        })
      : null;

    const [canDelete, accessForAccount] = await Promise.all([
      (async () => {
        const isRootDeleter = await hasRootApplicationPermission(ROOT_APPLICATION_DELETE_PERMISSION);
        if (isRootDeleter) return true;
        return hasApplicationPermission(activeAccountId, appId, deletePermissionNames);
      })(),
      resolveApplicationAccessForAccount(activeAccountId, appId),
    ]);

    // Resolve accessed data from authz grants (same as original)
    const appSessions = personalAccountId
      ? await getApplicationRoleGrantsForAccount(personalAccountId, appId)
      : [];

    const configuredAccess = normalizeAccess(application.responseFields).filter((field) => responseAccessSet.has(field));
    const policies = normalizePolicies(application.policies);
    const endpoints = normalizeEndpoints(application.endpoints);
    const accessedData = Array.from(new Set(appSessions.map((row) => row.roleId)));

    return {
      id: application.id,
      name: application.name,
      description: application.description || undefined,
      icon: application.icon || undefined,
      website: application.website || undefined,
      status: application.status || undefined,
      isInternal: application.isInternal,
      connectedAt: connectionRow?.connectedAt?.toISOString() ?? undefined,
      configuredAccess,
      accessedData,
      hasUsedApp: appSessions.length > 0,
      policies,
      endpoints,
      canEdit: accessForAccount.canEdit,
      isRootViewer,
      canDelete,
    };
  } catch (error) {
    await logError('database', error, `getApplicationDetailsForViewerV2:${appId}`);
    return null;
  }
}

export async function getApplicationDetailPageData(
  appId: string,
  options?: { rootMode?: boolean },
): Promise<ApplicationDetailPageData | null> {
  const details = await getApplicationDetailsForViewerV2(appId, options);
  if (!details) return null;

  const [
    canEditBasics,
    canViewConfig,
    canViewRoles,
    canViewUsers,
    canDeleteApplication,
    canViewApplicationAccess,
    logPermissions,
  ] = await Promise.all([
    canCurrentAccountEditApplicationBasics(appId),
    canCurrentAccountViewApplicationConfig(appId),
    canCurrentAccountViewApplicationRoles(appId),
    canCurrentAccountViewApplicationUsers(appId),
    canCurrentAccountDeleteApplication(appId),
    checkPermissions([...ACCESS_APPLICATION_VIEW_PERMISSIONS]),
    getApplicationLogPermissions(appId),
  ]);

  const userStats = canViewUsers ? await getApplicationUserStats(appId) : null;

  return {
    details,
    userStats,
    logPermissions,
    permissions: {
      canEditBasics,
      canViewConfig,
      canViewRoles,
      canViewUsers,
      canDeleteApplication,
      canViewApplicationAccess,
    },
  };
}

export async function canCurrentAccountManageApplicationRoles(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.manage'], ROOT_APPLICATION_ROLES_MANAGE_PERMISSION);
}

export async function canCurrentAccountEditApplicationBasics(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['basics.edit'], ROOT_APPLICATION_BASICS_EDIT_PERMISSION);
}

export async function canCurrentAccountDeleteApplication(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['delete'], ROOT_APPLICATION_DELETE_PERMISSION);
}

export async function canCurrentAccountViewApplicationConfig(appId: string): Promise<boolean> {
  const canUpdate = await canCurrentAccountUpdateApplicationConfig(appId);
  if (canUpdate) return true;
  return canCurrentAccountAccessApplicationByBase(appId, ['config.view'], ROOT_APPLICATION_CONFIG_VIEW_PERMISSION);
}

export async function canCurrentAccountUpdateApplicationConfig(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['config.update'], ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION);
}

export async function canCurrentAccountViewApplicationRoles(appId: string): Promise<boolean> {
  const [canManageRoles, canResetPush] = await Promise.all([
    canCurrentAccountManageApplicationRoles(appId),
    canCurrentAccountResetApplicationRolePush(appId),
  ]);
  if (canManageRoles || canResetPush) return true;
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.view'], ROOT_APPLICATION_ROLES_VIEW_PERMISSION);
}

export async function canCurrentAccountResetApplicationRolePush(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.resetPush'], ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION);
}

export async function canCurrentAccountViewApplicationUsers(appId: string): Promise<boolean> {
  const [canRemoveUser, canUpdateRole] = await Promise.all([
    canCurrentAccountRemoveApplicationUser(appId),
    canCurrentAccountUpdateApplicationUserRole(appId),
  ]);
  if (canRemoveUser || canUpdateRole) return true;
  return canCurrentAccountAccessApplicationByBase(
    appId,
    ['account.view', 'user.view'],
    ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
    ROOT_APPLICATION_USER_VIEW_PERMISSION,
  );
}

export async function canCurrentAccountRemoveApplicationUser(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(
    appId,
    ['account.delete', 'user.remove'],
    ROOT_APPLICATION_ACCOUNT_DELETE_PERMISSION,
    ROOT_APPLICATION_USER_REMOVE_PERMISSION,
  );
}

export async function canCurrentAccountUpdateApplicationUserRole(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(
    appId,
    ['account.role.update', 'account.connection.assign', 'user.updateRole'],
    ROOT_APPLICATION_ACCOUNT_ROLE_UPDATE_PERMISSION,
    ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION,
  );
}

export async function canCurrentAccountViewApplicationLogs(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['logs.view'], ROOT_APPLICATION_LOGS_VIEW_PERMISSION);
}

export async function canCurrentAccountViewApplicationDevLogs(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['devlogs.view'], ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION);
}

export async function canCurrentAccountClearApplicationDevLogs(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['devlogs.clear'], ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION);
}

async function canCurrentAccountViewApplication(appId: string): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, APPLICATION_VIEW_BASES, ROOT_APPLICATION_VIEW_PERMISSION);
}


// ---------------------------------------------------------------------------
// Meta update (owner — name, description, icon, website only, no status)
// ---------------------------------------------------------------------------

const updateAppMetaSchema = z.object({
  appId: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer.').optional().or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
});

/**
 * Function updateAppMeta.
 *
 * Allows the application owner to update name, description, icon, and website.
 * Does NOT touch status — that goes through the publication request flow.
 */
export async function updateAppMeta(
  input: z.infer<typeof updateAppMetaSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = updateAppMetaSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website } = parsed.data;

  const canEdit = await canCurrentAccountEditApplicationBasics(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to edit application metadata.' };

  try {
    await prisma.application.update({
      where: { id: appId },
      data: {
        name,
        description: description || null,
        icon: icon || null,
        website: website || null,
      },
    });
    revalidateApplicationDetailRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppMeta:${appId}`);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Publication request + status log
// ---------------------------------------------------------------------------

export type AppStatusLogEntry = {
  id: string;
  action: string;
  status: string;
  timestamp: string;
  actor: string;
};

/**
 * Function getAppStatusLog.
 *
 * Returns activity log entries for this application scoped to status changes
 * and publication events. Accessible to the app owner and root viewers.
 */
export async function getAppStatusLog(appId: string): Promise<AppStatusLogEntry[]> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  const canView = await canCurrentAccountViewApplication(appId);
  if (!canView) return [];

  try {
    const rows = await prisma.activity.findMany({
      where: {
        memberId: appId,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      timestamp: new Date(row.timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      actor: row.actorAccountId,
    }));
  } catch (error) {
    await logError('database', error, `getAppStatusLog:${appId}`);
    return [];
  }
}

/**
 * Function requestAppPublication.
 *
 * Owner submits a request to publish the application (move from development → pending review).
 * Creates an activity log entry and sets a bridge record to track the pending request.
 * Actual approval/rejection is done by a root user via updateManagedApplicationStatus.
 */
export async function requestAppPublication(
  appId: string,
): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountEditApplicationBasics(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to request publication for this application.' };

  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { status: true },
    });

    if (!app) return { success: false, error: 'Application not found.' };
    if (app.status === 'active') return { success: false, error: 'Application is already active.' };
    if (app.status === 'blocked') return { success: false, error: 'Blocked applications cannot request publication.' };

    // Check if a pending request already exists
    const existing = await prisma.applicationBridge.findFirst({
      where: { appId, type: 'publicationRequest', value: 'pending' },
    });
    if (existing) return { success: false, error: 'A publication request is already pending.' };

    await prisma.$transaction(async (tx) => {
      // Mark the request as pending in the bridge table
      await tx.applicationBridge.create({
        data: { appId, type: 'publicationRequest', value: 'pending' },
      });

      // Log the event against the app ID as the target
      await tx.activity.create({
        data: {
          memberId: appId,
          actorAccountId: accountId,
          action: 'Publication requested by owner.',
          status: 'Pending',
          ip: 'system',
          timestamp: new Date(),
        },
      });
    });

    revalidateApplicationDetailRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `requestAppPublication:${appId}`);
    return { success: false, error: 'Failed to submit publication request.' };
  }
}

/**
 * Function getAppPublicationRequestStatus.
 *
 * Returns whether a pending publication request exists for this app.
 */
export async function getAppPublicationRequestStatus(
  appId: string,
): Promise<'none' | 'pending'> {
  try {
    const record = await prisma.applicationBridge.findFirst({
      where: { appId, type: 'publicationRequest', value: 'pending' },
      select: { id: true },
    });
    return record ? 'pending' : 'none';
  } catch {
    return 'none';
  }
}

// ---------------------------------------------------------------------------
// Ownership data
// ---------------------------------------------------------------------------

export type AppOwnerEntry = {
  accountId: string;
  displayName: string;
  accountType: string;
  neupId?: string;
  isVerified: boolean;
};

export type AppAccessEntry = {
  accountId: string;
  displayName: string;
  accountType: string;
  neupId?: string;
  isVerified: boolean;
  roles: string[];
  /** null for direct grant compatibility. */
  via: null | string;
};

export type AppOwnershipData = {
  owners: AppOwnerEntry[];
  accessGrants: AppAccessEntry[];
};

/**
 * Function getAppOwnershipData.
 *
 * Returns the owner(s) and all accounts with access grants.
 */
export async function getAppOwnershipData(appId: string): Promise<AppOwnershipData | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canView = await canCurrentAccountViewApplication(appId);
  if (!canView) return null;

  try {
    // All access grants for this app
    const grants = await prisma.access.findMany({
      where: {
        accessApplicationId: appId,
        ...activeAccessWhere(),
      },
      select: {
        roleId: true,
        parentAccount: {
          select: {
            id: true,
            displayName: true,
            accountType: true,
            isVerified: true,
            neupIds: { where: { isPrimary: true }, select: { neupId: true }, take: 1 },
            individualProfile: { select: { firstName: true, lastName: true } },
            brandProfile: { select: { brandName: true } },
          },
        },
      },
    });

    // Helper to resolve a display name from the included account data
    function resolveDisplayName(target: {
      displayName: string | null;
      individualProfile: { firstName: string | null; lastName: string | null } | null;
      brandProfile: { brandName: string | null } | null;
    }): string {
      if (target.brandProfile?.brandName) return target.brandProfile.brandName;
      if (target.displayName) return target.displayName;
      const first = target.individualProfile?.firstName ?? '';
      const last = target.individualProfile?.lastName ?? '';
      const full = `${first} ${last}`.trim();
      return full || 'Unknown';
    }

    // Separate owners from other grantees; group roles per account
    const ownerMap = new Map<string, AppOwnerEntry>();
    const accessMap = new Map<string, AppAccessEntry>();

    for (const g of grants) {
      const t = g.parentAccount;
      if (!t) continue;
      const displayName = resolveDisplayName(t);
      const neupId = t.neupIds[0]?.neupId;
      const isOwnerRole = ownerRoleKeys.has(g.roleId.trim().toLowerCase());

      if (isOwnerRole) {
        if (!ownerMap.has(t.id)) {
          ownerMap.set(t.id, {
            accountId: t.id,
            displayName,
            accountType: t.accountType,
            neupId,
            isVerified: t.isVerified,
          });
        }
      } else {
        if (!accessMap.has(t.id)) {
          accessMap.set(t.id, {
            accountId: t.id,
            displayName,
            accountType: t.accountType,
            neupId,
            isVerified: t.isVerified,
            roles: [],
            via: null,
          });
        }
        const entry = accessMap.get(t.id)!;
        if (!entry.roles.includes(g.roleId)) {
          entry.roles.push(g.roleId);
        }
      }
    }

    return {
      owners: Array.from(ownerMap.values()),
      accessGrants: Array.from(accessMap.values()),
    };
  } catch (error) {
    await logError('database', error, `getAppOwnershipData:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// User stats
// ---------------------------------------------------------------------------

export type ApplicationUserStats = {
  total: number;
  last24h: number;
  lastWeek: number;
  lastMonth: number;
};

export type ApplicationDetailPageData = {
  details: ApplicationDetailsV2;
  userStats: ApplicationUserStats | null;
  logPermissions: {
    canViewLogs: boolean;
    canViewDevLogs: boolean;
  };
  permissions: {
    canEditBasics: boolean;
    canViewConfig: boolean;
    canViewRoles: boolean;
    canViewUsers: boolean;
    canDeleteApplication: boolean;
    canViewApplicationAccess: boolean;
  };
};

/**
 * Returns user counts for an application based on ApplicationConnection records.
 * Accessible to any authenticated user who can view the application.
 */
export async function getApplicationUserStats(appId: string): Promise<ApplicationUserStats | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canViewUsers = await canCurrentAccountViewApplicationUsers(appId);
  if (!canViewUsers) return null;

  try {
    const now = new Date();
    const minus24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const minus7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const minus30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, last24h, lastWeek, lastMonth] = await Promise.all([
      prisma.connection.count({ where: { appId } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus24h } } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus7d } } }),
      prisma.connection.count({ where: { appId, connectedAt: { gte: minus30d } } }),
    ]);

    return { total, last24h, lastWeek, lastMonth };
  } catch (error) {
    await logError('database', error, `getApplicationUserStats:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Application users (paginated)
// ---------------------------------------------------------------------------

export type AppUserStatus = 'active' | 'creationRequired' | 'deactivated';
export type AppUserSortKey = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

const SEARCHABLE_APP_USER_ACCOUNT_TYPES = new Set(['individual', 'brand', 'subbrand', 'branch', 'dependent', 'guest', 'root']);
const APP_USER_ACTIVE_IN_UNITS_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

type ParsedApplicationUserSearch = {
  text: string;
  accountType?: string;
  neupId?: string;
  roleName?: string;
  activeSince?: Date;
};

function parseApplicationUserSearch(search: string): ParsedApplicationUserSearch {
  const parsed: ParsedApplicationUserSearch = { text: '' };
  const textParts: string[] = [];

  for (const rawPart of search.split('&')) {
    const part = rawPart.trim();
    if (!part) continue;

    const typeMatch = part.match(/^(?:type|accounttype|acctype|actype):(.+)$/i);
    if (typeMatch) {
      const accountType = typeMatch[1]?.trim().toLowerCase();
      if (accountType && SEARCHABLE_APP_USER_ACCOUNT_TYPES.has(accountType)) {
        parsed.accountType = accountType === 'branch' ? 'subbrand' : accountType;
        continue;
      }
    }

    const neupIdMatch = part.match(/^neupid:(.+)$/i);
    if (neupIdMatch) {
      const neupId = neupIdMatch[1]?.trim();
      if (neupId) {
        parsed.neupId = neupId;
        continue;
      }
    }

    const roleMatch = part.match(/^role:(.+)$/i);
    if (roleMatch) {
      const roleName = roleMatch[1]?.trim();
      if (roleName) {
        parsed.roleName = roleName;
        continue;
      }
    }

    const activeInMatch = part.match(/^activein:(\d+)([mhdw])$/i);
    if (activeInMatch) {
      const amount = Number(activeInMatch[1]);
      const unit = activeInMatch[2].toLowerCase();
      if (amount > 0 && APP_USER_ACTIVE_IN_UNITS_MS[unit]) {
        parsed.activeSince = new Date(Date.now() - amount * APP_USER_ACTIVE_IN_UNITS_MS[unit]);
        continue;
      }
    }

    textParts.push(part);
  }

  parsed.text = textParts.join(' & ').trim();
  return parsed;
}

export type AppUserEntry = {
  connectionId: string;
  accountId: string;
  displayName: string | null;
  displayImage: string | null;
  accountType: string;
  isVerified: boolean;
  connectedAt: Date;
  status: string | null;
};

export type AppUsersPage = {
  users: AppUserEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AppUserConnectionDetails = {
  connectionId: string;
  appId: string;
  accountId: string;
  connectedAt: Date;
  connectionStatus: string;
  roleId: string | null;
  roleIds: string[];
  pendingRoleIds: string[];
  displayName: string | null;
  displayImage: string | null;
  accountType: string;
  isVerified: boolean;
  accountStatus: string | null;
  createdAt: Date;
  neupId: string | null;
};

export type AppRoleOption = {
  id: string;
  name: string;
  description: string | null;
  scope: string[];
  acquisitionType: string;
  approvalPolicy: string;
};

type RawAppRoleOptionRow = {
  id: string;
  name: string;
  description: string | null;
  scopeForText: string | null;
  scopeLevel: string | null;
  acquisitionType: string | null;
  approvalPolicy: string | null;
};

function hasUsableRoleScope(scope: unknown): boolean {
  return Array.isArray(scope) && scope.length > 0;
}

function parseStoredJsonText(value: string | null | undefined): Prisma.JsonValue | string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as Prisma.JsonValue;
  } catch {
    return trimmed;
  }
}

function isInvalidStoredJsonReadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return error.message.includes('is not valid JSON')
    || error.message.includes('Unexpected token');
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/*
::neup.documentation::application-role-options-loader

Loads assignable role options for application-user role management.

This loader reads assignable role options from `scope_for` and `scope_level`.

::end
*/

async function loadApplicationRoleOptionRows(appId: string) {
  try {
    return await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        scopeFor: true,
        scopeLevel: true,
        acquisitionType: true,
        approvalPolicy: true,
      },
    });
  } catch (error) {
    if (!isInvalidStoredJsonReadError(error)) throw error;

    const rows = await prisma.$queryRaw<RawAppRoleOptionRow[]>(Prisma.sql`
      SELECT
        r."id",
        r."name",
        r."description",
        r."scope_for"::text AS "scopeForText",
        r."scope_level" AS "scopeLevel",
        r."acquisition_type" AS "acquisitionType",
        r."approval_policy" AS "approvalPolicy"
      FROM "authz_role" r
      WHERE r."app_id" = ${appId}
      ORDER BY r."name" ASC
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      scopeFor: parseStoredJsonText(row.scopeForText),
      scopeLevel: row.scopeLevel,
      acquisitionType: row.acquisitionType,
      approvalPolicy: row.approvalPolicy,
    }));
  }
}

/**
 * Returns a paginated list of accounts connected to an application.
 * Supports filtering by status and connectedAt window, plus sorting.
 * Accessible to the app owner and root viewers.
 */
export async function getApplicationUsersPaginated(params: {
  appId: string;
  page: number;
  pageSize?: number;
  search?: string;
  status?: AppUserStatus;
  activeSince?: '1d' | '7d' | '30d';
  sort?: AppUserSortKey;
}): Promise<AppUsersPage> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const canView = await canCurrentAccountViewApplicationUsers(params.appId);
  if (!canView) return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const { appId, page, pageSize = 20, search = '', status, activeSince, sort = 'newest' } = params;

  try {
    const parsedSearch = parseApplicationUserSearch(search);
    const now = new Date();
    const sinceMap: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };
    const connectionSinceDate = activeSince
      ? new Date(now.getTime() - sinceMap[activeSince] * 24 * 60 * 60 * 1000)
      : undefined;

    // Map AppUserStatus to account status values
    const statusMap: Record<AppUserStatus, string | null> = {
      active: 'active',
      deactivated: 'deactivated',
      creationRequired: null, // accounts with no status set
    };

    const connectionWhere: Record<string, unknown> = { appId };
    if (connectionSinceDate) connectionWhere.connectedAt = { gte: connectionSinceDate };

    // Fetch connections with joined account data
    const orderByMap: Record<AppUserSortKey, object> = {
      newest:    { connectedAt: 'desc' },
      oldest:    { connectedAt: 'asc' },
      name_asc:  { account: { displayName: 'asc' } },
      name_desc: { account: { displayName: 'desc' } },
    };

    const accountWhere: Record<string, unknown> = {};
    if (status === 'creationRequired') {
      accountWhere.status = null;
    } else if (status) {
      accountWhere.status = statusMap[status];
    }
    if (parsedSearch.accountType === 'root') {
      accountWhere.accessMemberRows = {
        some: {
          accessType: 'acc_self_root',
          status: 'active',
          OR: [
            { isTemporary: null },
            { isTemporary: { gt: new Date() } },
          ],
        },
      };
    } else if (parsedSearch.accountType) {
      accountWhere.accountType = parsedSearch.accountType;
    }

    if (parsedSearch.neupId) {
      accountWhere.neupIds = {
        some: {
          neupId: {
            contains: parsedSearch.neupId,
            mode: 'insensitive',
          },
        },
      };
    }

    if (parsedSearch.text) {
      accountWhere.OR = [
        { displayName: { contains: parsedSearch.text, mode: 'insensitive' } },
        { id: { contains: parsedSearch.text, mode: 'insensitive' } },
        { neupIds: { some: { neupId: { contains: parsedSearch.text, mode: 'insensitive' } } } },
      ];
    }

    if (Object.keys(accountWhere).length > 0) {
      connectionWhere.account = accountWhere;
    }

    if (parsedSearch.roleName) {
      const [directRoleConnections, grantedRoleAccessRows] = await Promise.all([
        prisma.connection.findMany({
          where: {
            appId,
            OR: [
              {
                role: {
                  id: {
                    equals: parsedSearch.roleName,
                    mode: 'insensitive',
                  },
                },
              },
              {
                role: {
                  name: {
                    equals: parsedSearch.roleName,
                    mode: 'insensitive',
                  },
                },
              },
              {
                roleId: {
                  equals: parsedSearch.roleName,
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { accountId: true },
        }),
        prisma.access.findMany({
          where: {
            memberAccountId: { not: null },
            accessApplicationId: appId,
            ...activeAccessWhere(),
            role: {
              appId,
              OR: [
                {
                  id: {
                    equals: parsedSearch.roleName,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    equals: parsedSearch.roleName,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
          select: { memberAccountId: true },
          distinct: ['memberAccountId'],
        }),
      ]);

      const matchingAccountIds = Array.from(new Set([
        ...directRoleConnections.map((row) => row.accountId),
        ...grantedRoleAccessRows.map((row) => row.memberAccountId).filter((value): value is string => typeof value === 'string' && value.length > 0),
      ]));

      if (matchingAccountIds.length === 0) {
        return { users: [], total: 0, page, pageSize, totalPages: 0 };
      }

      const currentAccountWhere = (connectionWhere.account as Record<string, unknown> | undefined) ?? {};
      const currentAccountIdFilter = currentAccountWhere.id;
      let narrowedAccountIds = matchingAccountIds;

      if (currentAccountIdFilter && typeof currentAccountIdFilter === 'object' && currentAccountIdFilter !== null && 'in' in currentAccountIdFilter) {
        const existingIds = Array.isArray((currentAccountIdFilter as { in?: unknown }).in)
          ? (currentAccountIdFilter as { in: unknown[] }).in.filter((value): value is string => typeof value === 'string')
          : [];
        narrowedAccountIds = matchingAccountIds.filter((id) => existingIds.includes(id));
      }

      if (narrowedAccountIds.length === 0) {
        return { users: [], total: 0, page, pageSize, totalPages: 0 };
      }

      connectionWhere.account = {
        ...currentAccountWhere,
        id: { in: narrowedAccountIds },
      };
    }

    if (parsedSearch.activeSince) {
      const activeAccounts = await prisma.activity.groupBy({
        by: ['memberId'],
        where: { timestamp: { gte: parsedSearch.activeSince } },
      });

      const activeAccountIds = activeAccounts.map((entry) => entry.memberId);
      if (activeAccountIds.length === 0) {
        return { users: [], total: 0, page, pageSize, totalPages: 0 };
      }

      const currentAccountWhere = (connectionWhere.account as Record<string, unknown> | undefined) ?? {};
      connectionWhere.account = {
        ...currentAccountWhere,
        id: { in: activeAccountIds },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereArg = connectionWhere as any;

    const [total, rows] = await Promise.all([
      prisma.connection.count({ where: whereArg }),
      prisma.connection.findMany({
        where: whereArg,
        orderBy: orderByMap[sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          connectedAt: true,
          account: {
            select: {
              id: true,
              displayName: true,
              displayImage: true,
              details: true,
              accountType: true,
              isVerified: true,
              status: true,
              individualProfile: {
                select: {
                  details: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const users: AppUserEntry[] = rows.map((r) => {
      const gender = extractGenderFromDetails({
        accountDetails: r.account.details,
        individualDetails: r.account.individualProfile?.details,
      });

      return {
        connectionId: r.id,
        accountId: r.account.id,
        displayName: r.account.displayName,
        displayImage: resolveDisplayImage({
          displayImage: r.account.displayImage,
          accountType: r.account.accountType,
          gender,
        }),
        accountType: r.account.accountType,
        isVerified: r.account.isVerified,
        connectedAt: r.connectedAt,
        status: r.account.status,
      };
    });

    return {
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    await logError('database', error, `getApplicationUsersPaginated:${appId}`);
    return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }
}

export async function getApplicationUserConnectionDetails(params: {
  appId: string;
  connectionId: string;
}): Promise<AppUserConnectionDetails | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canView = await canCurrentAccountViewApplicationUsers(params.appId);
  if (!canView) return null;

  try {
    const [row, pendingRequests] = await Promise.all([
      prisma.connection.findFirst({
        where: {
          id: params.connectionId,
          appId: params.appId,
        },
        select: {
          id: true,
          appId: true,
          accountId: true,
          connectedAt: true,
          status: true,
          roleId: true,
          account: {
            select: {
              id: true,
              displayName: true,
              displayImage: true,
              details: true,
              accountType: true,
              isVerified: true,
              status: true,
              createdAt: true,
              individualProfile: {
                select: {
                  details: true,
                },
              },
              neupIds: {
                where: { isPrimary: true },
                take: 1,
                select: { neupId: true },
              },
            },
          },
        },
      }),
      prisma.request.findMany({
        where: {
          status: 'pending',
          type: 'applicationRoleRequest',
        },
        select: { data: true },
      }),
    ]);

    if (!row) return null;

    const accessRows = await prisma.access.findMany({
      where: {
        memberAccountId: row.accountId,
        parentAccountId: row.accountId,
        assetApplicationId: params.appId,
        ...activeAccessWhere(),
      },
      select: {
        roleId: true,
        role: {
          select: {
            appId: true,
            scopeFor: true,
            scopeLevel: true,
          },
        },
      },
    });

    const roleIds = Array.from(
      new Set(
        accessRows
          .filter((accessRow) => accessRow.role.appId === params.appId)
          .filter((accessRow) =>
            roleMatchesAssignmentModesPolicy({
              accountType: row.account.accountType,
              scopeFor: accessRow.role.scopeFor,
              scopeLevel: accessRow.role.scopeLevel,
              modes: ['public', 'toApprove', 'root'],
            }),
          )
          .map((accessRow) => accessRow.roleId),
      ),
    );

    const pendingRoleIds = Array.from(
      new Set(
        pendingRequests.flatMap((request) => {
          const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
          if (typeof data.appId !== 'string' || data.appId !== params.appId) return [];
          if (typeof data.accountId !== 'string' || data.accountId !== row.accountId) return [];
          if (typeof data.connectionId !== 'string' || data.connectionId !== row.id) return [];
          if (data.assignmentKind !== 'connectionRole') return [];
          return stringList(data.roleIds);
        }),
      ),
    );

    const gender = extractGenderFromDetails({
      accountDetails: row.account.details,
      individualDetails: row.account.individualProfile?.details,
    });

    return {
      connectionId: row.id,
      appId: row.appId,
      accountId: row.accountId,
      connectedAt: row.connectedAt,
      connectionStatus: row.status,
      roleId: row.roleId,
      roleIds,
      pendingRoleIds,
      displayName: row.account.displayName,
      displayImage: resolveDisplayImage({
        displayImage: row.account.displayImage,
        accountType: row.account.accountType,
        gender,
      }),
      accountType: row.account.accountType,
      isVerified: row.account.isVerified,
      accountStatus: row.account.status,
      createdAt: row.account.createdAt,
      neupId: row.account.neupIds[0]?.neupId ?? null,
    };
  } catch (error) {
    await logError('database', error, `getApplicationUserConnectionDetails:${params.appId}:${params.connectionId}`);
    return null;
  }
}

export async function getApplicationRoleOptions(appId: string, targetAccountType?: string | null): Promise<AppRoleOption[]> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  const isRootEditor = await hasRootApplicationPermission(ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION);
  const canView = await canCurrentAccountViewApplicationUsers(appId);
  if (!canView) return [];

  try {
    const roles = await loadApplicationRoleOptionRows(appId);
    const normalizedRoles: AppRoleOption[] = roles.map((role) => ({
      ...role,
      scope: deriveLegacyRoleScopesFromPolicy(
        normalizeAuthzScopeFor((role as any).scopeFor),
        normalizeSingleAuthzScopeLevel((role as any).scopeLevel),
      ),
      acquisitionType: role.acquisitionType ?? 'assignment',
      approvalPolicy: role.approvalPolicy ?? 'none',
    }));

    if (!targetAccountType) {
      return normalizedRoles.filter(
        (role) => hasUsableRoleScope(role.scope) && isRoleDirectlyAssignable(role.acquisitionType, role.approvalPolicy, 'manager'),
      );
    }

    return normalizedRoles.filter((role) => {
      if (!hasUsableRoleScope(role.scope)) return false;
      if (!isRoleDirectlyAssignable(role.acquisitionType, role.approvalPolicy, isRootEditor ? 'root' : 'manager')) return false;
      const modes = isRootEditor
        ? ['public', 'toApprove', 'root'] as const
        : ['public', 'toApprove'] as const;
      return roleMatchesAssignmentModesPolicy({
        accountType: targetAccountType,
        scopeFor: (role as any).scopeFor ?? [],
        scopeLevel: (role as any).scopeLevel ?? 'assignable',
        modes,
      });
    });
  } catch (error) {
    await logError('database', error, `getApplicationRoleOptions:${appId}`);
    return [];
  }
}

export async function assignApplicationConnectionRole(input: {
  appId: string;
  connectionId: string;
  roleIds: string[];
}): Promise<{ success: boolean; error?: string; pendingApproval?: boolean; roleIds?: string[]; pendingRoleIds?: string[] }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const [isRootEditor, canManageRoles] = await Promise.all([
    hasRootApplicationPermission(ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION),
    canCurrentAccountUpdateApplicationUserRole(input.appId),
  ]);
  if (!isRootEditor && !canManageRoles) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const uniqueRoleIds = Array.from(new Set(input.roleIds.map((roleId) => roleId.trim()).filter(Boolean)));

    const [connection, roles, pendingRequests] = await Promise.all([
      prisma.connection.findFirst({
        where: { id: input.connectionId, appId: input.appId },
        select: {
          id: true,
          accountId: true,
          account: { select: { accountType: true } },
        },
      }),
      prisma.authzRole.findMany({
        where: { id: { in: uniqueRoleIds }, appId: input.appId },
        select: { id: true, name: true, scopeFor: true, scopeLevel: true, acquisitionType: true, approvalPolicy: true },
      }),
      prisma.request.findMany({
        where: {
          status: 'pending',
          type: 'applicationRoleRequest',
        },
        select: { id: true, data: true },
      }),
    ]);

    if (!connection) return { success: false, error: 'Connection not found.' };
    if (roles.length !== uniqueRoleIds.length) return { success: false, error: 'One or more roles were not found for this application.' };

    const invalidRole = roles.find((role) => normalizeAuthzScopeFor(role.scopeFor).length === 0);
    if (invalidRole) {
      return { success: false, error: 'Roles without a scope cannot be assigned to a user.' };
    }

    const assignableRoles = roles.filter((role) =>
      isRoleDirectlyAssignable(role.acquisitionType, role.approvalPolicy, isRootEditor ? 'root' : 'manager') &&
      roleMatchesAssignmentModesPolicy({
        accountType: connection.account.accountType,
        scopeFor: role.scopeFor,
        scopeLevel: role.scopeLevel,
        modes: isRootEditor ? ['public', 'root'] : ['public'],
      }),
    );
    const immediateRoles = assignableRoles.filter((role) => roleRequestTarget(role.acquisitionType, role.approvalPolicy) === null);
    const approvableRoles = assignableRoles.filter((role) => roleRequestTarget(role.acquisitionType, role.approvalPolicy) !== null);

    if (assignableRoles.length !== roles.length) {
      return { success: false, error: 'One or more selected roles cannot be assigned from this page.' };
    }

    const existingAssignedRows = await prisma.access.findMany({
      where: {
        memberAccountId: connection.accountId,
        parentAccountId: connection.accountId,
        assetApplicationId: input.appId,
        ...activeAccessWhere(),
      },
      select: {
        roleId: true,
        role: {
          select: {
            scopeFor: true,
            scopeLevel: true,
            appId: true,
            acquisitionType: true,
            approvalPolicy: true,
          },
        },
      },
    });

    const currentAssignableRoleIds = Array.from(
      new Set(
        existingAssignedRows
          .filter((row) => row.role.appId === input.appId)
          .filter((row) => isRoleDirectlyAssignable(row.role.acquisitionType, row.role.approvalPolicy, isRootEditor ? 'root' : 'manager'))
          .filter((row) =>
            roleMatchesAssignmentModesPolicy({
              accountType: connection.account.accountType,
              scopeFor: row.role.scopeFor,
              scopeLevel: row.role.scopeLevel,
              modes: isRootEditor ? ['public', 'root'] : ['public'],
            }),
          )
          .map((row) => row.roleId),
      ),
    );

    const nextImmediateRoleIds = immediateRoles.map((role) => role.id);
    const roleIdsToRemove = currentAssignableRoleIds.filter((roleId) => !nextImmediateRoleIds.includes(roleId));
    const roleIdsToAdd = nextImmediateRoleIds.filter((roleId) => !currentAssignableRoleIds.includes(roleId));

    const existingPendingRoleIds = Array.from(
      new Set(
        pendingRequests.flatMap((request) => {
          const data = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
          if (typeof data.appId !== 'string' || data.appId !== input.appId) return [];
          if (typeof data.accountId !== 'string' || data.accountId !== connection.accountId) return [];
          if (typeof data.connectionId !== 'string' || data.connectionId !== connection.id) return [];
          if (data.assignmentKind !== 'connectionRole') return [];
          return stringList(data.roleIds);
        }),
      ),
    );

    const nextPendingRoleIds = approvableRoles
      .map((role) => role.id)
      .filter((roleId) => !existingPendingRoleIds.includes(roleId));

    await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      if (roleIdsToRemove.length > 0) {
        await tx.access.deleteMany({
          where: {
            memberAccountId: connection.accountId,
            parentAccountId: connection.accountId,
            assetApplicationId: input.appId,
            roleId: { in: roleIdsToRemove },
          },
        });
      }

      for (const roleId of roleIdsToAdd) {
        await ensureAccessGrant(tx, {
          memberAccountId: connection.accountId,
          parentAccountId: connection.accountId,
          childApplicationId: input.appId,
          accessApplicationId: input.appId,
          roleId,
          details: {
            connectionId: connection.id,
            source: 'assignApplicationConnectionRole',
          },
        });
      }

      if (nextPendingRoleIds.length > 0) {
        const requestedRoles = approvableRoles.filter((role) => nextPendingRoleIds.includes(role.id));
        await tx.request.create({
          data: {
            senderId: accountId,
            recipientId: accountId,
            action: 'applicationRoleRequest',
            type: 'applicationRoleRequest',
            data: {
              appId: input.appId,
              accountId: connection.accountId,
              connectionId: connection.id,
              roleIds: requestedRoles.map((role) => role.id),
              roles: requestedRoles.map((role) => ({
                id: role.id,
                name: role.name,
                scopeFor: normalizeAuthzScopeFor(role.scopeFor),
                scopeLevel: normalizeSingleAuthzScopeLevel(role.scopeLevel),
              })),
              assignmentKind: 'connectionRole',
              requestTarget: 'admin',
            },
          },
        });
      }
    });

    await dispatchAccountUpdatedEvent({
      accountId: connection.accountId,
      changedFields: ['role'],
    });

    if (nextPendingRoleIds.length > 0) {
      revalidateApplicationRequestsRoutes(input.appId);
    }
    revalidateApplicationUsersRoutes(input.appId, input.connectionId);

    return {
      success: true,
      pendingApproval: nextPendingRoleIds.length > 0,
      roleIds: nextImmediateRoleIds,
      pendingRoleIds: Array.from(new Set([...existingPendingRoleIds, ...nextPendingRoleIds])),
    };
  } catch (error) {
    await logError('database', error, `assignApplicationConnectionRole:${input.appId}:${input.connectionId}`);
    return { success: false, error: 'Failed to assign role.' };
  }
}

// ---------------------------------------------------------------------------
// Owner edit — name, description, icon, website, status
// ---------------------------------------------------------------------------

const updateAppEditSchema = z.object({
  appId: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer.').optional().or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['development', 'active', 'hold', 'blocked']),
});

/**
 * Function updateAppEdit.
 *
 * Allows the application owner to update name, description, icon, website, and status.
 */
export async function updateAppEdit(
  input: z.infer<typeof updateAppEditSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = updateAppEditSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website, status } = parsed.data;

  const canEdit = await canCurrentAccountEditApplicationBasics(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to edit this application.' };

  try {
    await prisma.application.update({
      where: { id: appId },
      data: {
        name,
        description: description || null,
        icon: icon || null,
        website: website || null,
        status,
      },
    });
    revalidateApplicationEditRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppEdit:${appId}`);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Config page — save secret, access fields, and silent SSO origins together
// ---------------------------------------------------------------------------

const saveAppConfigSchema = z.object({
  appId: z.string().min(1),
  secretKey: z.string().min(16, 'Secret must be at least 16 characters.').optional().or(z.literal('')),
  access: z.array(z.enum(applicationAccessFields)).default([]),
  party: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  allowDevMode: z.boolean().optional().default(false),
  allowDevIpMode: z.boolean().optional().default(false),
  definedScopes: z.array(applicationAuthzDefinitionTupleSchema).default([]),
  allowMultipleDefinedScopes: z.boolean().optional().default(false),
  applicableForDefinitions: z.array(applicationAuthzDefinitionTupleSchema).default([]),
});

function enforcePartyFieldRules(
  party: ApplicationParty,
  fields: ApplicationAccessField[],
): ApplicationAccessField[] {
  const normalized = fields.filter((field, idx) => fields.indexOf(field) === idx);
  if (party === 0 || party === 1) {
    return normalized;
  }
  if (party === 2) {
    return normalized.filter((field) => field !== 'accountId');
  }
  return normalized.filter((field) => field !== 'accountId' && field !== 'neupid');
}

/**
 * Function saveAppConfig.
 *
 * Saves the application secret (if provided) and the accessTo field list.
 * Silent SSO origins are managed separately via addSilentSsoOrigin / removeSilentSsoOrigin.
 */
export async function saveAppConfig(
  input: z.infer<typeof saveAppConfigSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = saveAppConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const {
    appId,
    secretKey,
    access,
    party,
    allowDevMode,
    allowDevIpMode,
    definedScopes,
    allowMultipleDefinedScopes,
    applicableForDefinitions,
  } = parsed.data;
  const sanitizedAccess = enforcePartyFieldRules(
    party,
    access.filter((field) => responseAccessSet.has(field)),
  );
  const fixedTokenFields: ApplicationAccessField[] = [];
  const normalizedDefinedScopes = normalizeApplicationAuthzDefinitions(definedScopes);
  const normalizedApplicableForDefinitions = normalizeApplicationAuthzDefinitions(applicableForDefinitions);

  const canEdit = await canCurrentAccountUpdateApplicationConfig(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  try {
    const existing = await prisma.application.findUnique({
      where: { id: appId },
      select: { details: true },
    });

    const existingDetails =
      existing?.details && typeof existing.details === 'object'
        ? (existing.details as Record<string, unknown>)
        : {};

    const updateData: Record<string, unknown> = {
      responseFields: sanitizedAccess,
      tokenFields: fixedTokenFields,
      party,
      // Backward-compat: keep legacy JSON in sync until all callers are migrated.
      details: {
        ...existingDetails,
        access: sanitizedAccess,
        token_fields: fixedTokenFields,
        allowDevMode,
        allowDevIpMode,
        definedScopes: normalizedDefinedScopes,
        allowMultipleDefinedScopes,
        applicableForDefinitions: normalizedApplicableForDefinitions,
      },
    };
    if (secretKey && secretKey.trim().length >= 16) {
      updateData.appSecret = secretKey.trim();
    }

    await prisma.application.update({
      where: { id: appId },
      data: updateData,
    });

    revalidateApplicationConfigRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveAppConfig:${appId}`);
    return { success: false, error: 'Failed to save configuration.' };
  }
}

/**
 * Function getAppConfigData.
 *
 * Returns the data needed to render the config page.
 */
export async function getAppConfigData(appId: string, options?: { rootMode?: boolean }): Promise<{
  hasSecretKey: boolean;
  access: ApplicationAccessField[];
  tokenFields: ApplicationAccessField[];
  party: ApplicationParty;
  silentSsoOrigins: Array<{ id: string; value: string }>;
  serverIps: Array<{ id: string; value: string }>;
  accountUpdateWebhookUrl: string | null;
  roleUpdateWebhookUrl: string | null;
  allowDevMode: boolean;
  allowDevIpMode: boolean;
  definedScopes: ApplicationAuthzConfig['definedScopes'];
  allowMultipleDefinedScopes: boolean;
  applicableForDefinitions: ApplicationAuthzConfig['applicableForDefinitions'];
  status: string;
} | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;
  if (!(await canAccessRootApplicationMode(options?.rootMode))) return null;

  const canEdit = await canCurrentAccountViewApplicationConfig(appId);
  if (!canEdit) return null;

  try {
    const [app, originRows, serverIpRows, accountUpdateWebhookRecord, roleUpdateWebhookRecord] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: { appSecret: true, responseFields: true, tokenFields: true, party: true, details: true, status: true },
      }),
      prisma.applicationBridge.findMany({
        where: { appId, type: 'silentSsoOrigin' },
        select: { id: true, value: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.applicationBridge.findMany({
        where: { appId, type: 'serverIp' },
        select: { id: true, value: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'accountUpdateWebhook' },
        select: { value: true },
      }),
      prisma.applicationBridge.findFirst({
        where: { appId, type: 'roleUpdateWebhook' },
        select: { value: true },
      }),
    ]);

    if (!app) return null;

    const legacyDetails = app.details && typeof app.details === 'object'
      ? (app.details as Record<string, unknown>)
      : {};
    const authzConfig = extractApplicationAuthzConfig(app.details);

    const responseFieldSource =
      app.responseFields.length > 0 ? app.responseFields : (legacyDetails as any).access ?? [];
    const tokenFieldSource =
      app.tokenFields.length > 0 ? app.tokenFields : (legacyDetails as any).token_fields ?? [];
    const allowDevMode = Boolean((legacyDetails as any).allowDevMode);
    const allowDevIpMode = Boolean((legacyDetails as any).allowDevIpMode);
    const party = applicationPartyValues.includes(app.party as ApplicationParty)
      ? (app.party as ApplicationParty)
      : 1;

    return {
      hasSecretKey: Boolean(app.appSecret),
      access: enforcePartyFieldRules(
        party,
        normalizeAccess(responseFieldSource).filter((field) => responseAccessSet.has(field)),
      ),
      tokenFields: enforcePartyFieldRules(
        party,
        normalizeAccess(tokenFieldSource).filter((field) => tokenFieldSet.has(field)),
      ),
      party,
      silentSsoOrigins: originRows,
      serverIps: serverIpRows,
      accountUpdateWebhookUrl: accountUpdateWebhookRecord?.value ?? null,
      roleUpdateWebhookUrl: roleUpdateWebhookRecord?.value ?? null,
      allowDevMode,
      allowDevIpMode,
      definedScopes: authzConfig.definedScopes,
      allowMultipleDefinedScopes: authzConfig.allowMultipleDefinedScopes,
      applicableForDefinitions: authzConfig.applicableForDefinitions,
      status: app.status ?? 'development',
    };
  } catch (error) {
    await logError('database', error, `getAppConfigData:${appId}`);
    return null;
  }
}

export async function getApplicationAuthzConfig(appId: string): Promise<ApplicationAuthzConfig | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { details: true },
    });

    if (!app) return null;
    return extractApplicationAuthzConfig(app.details);
  } catch (error) {
    await logError('database', error, `getApplicationAuthzConfig:${appId}`);
    return null;
  }
}

export async function saveAccountUpdateWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  const url = input.url.trim();

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Webhook URL must use HTTPS.' };
      }
    } catch {
      return { success: false, error: 'Invalid webhook URL.' };
    }
  }

  try {
    if (!url) {
      await prisma.applicationBridge.deleteMany({
        where: { appId: input.appId, type: 'accountUpdateWebhook' },
      });
    } else {
      const existing = await prisma.applicationBridge.findFirst({
        where: { appId: input.appId, type: 'accountUpdateWebhook' },
        select: { id: true },
      });

      if (existing) {
        await prisma.applicationBridge.update({
          where: { id: existing.id },
          data: { value: url },
        });
      } else {
        await prisma.applicationBridge.create({
          data: { appId: input.appId, type: 'accountUpdateWebhook', value: url },
        });
      }
    }

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveAccountUpdateWebhookUrl:${input.appId}`);
    return { success: false, error: 'Failed to save webhook URL.' };
  }
}

export async function saveRoleUpdateWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountUpdateApplicationConfig(input.appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to configure this application.' };

  const url = input.url.trim();

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Webhook URL must use HTTPS.' };
      }
    } catch {
      return { success: false, error: 'Invalid webhook URL.' };
    }
  }

  try {
    if (!url) {
      await prisma.applicationBridge.deleteMany({
        where: { appId: input.appId, type: 'roleUpdateWebhook' },
      });
    } else {
      const existing = await prisma.applicationBridge.findFirst({
        where: { appId: input.appId, type: 'roleUpdateWebhook' },
        select: { id: true },
      });

      if (existing) {
        await prisma.applicationBridge.update({
          where: { id: existing.id },
          data: { value: url },
        });
      } else {
        await prisma.applicationBridge.create({
          data: { appId: input.appId, type: 'roleUpdateWebhook', value: url },
        });
      }
    }

    revalidateApplicationConfigRoutes(input.appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveRoleUpdateWebhookUrl:${input.appId}`);
    return { success: false, error: 'Failed to save webhook URL.' };
  }
}

export type ApplicationDevLogEntry = {
  id: string;
  createdAt: string;
  endpoint: string;
  method: string;
  statusCode: number;
  requesterIp: string | null;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  requestBody: unknown;
  query: unknown;
  requestMeta: unknown;
  responseBody: unknown;
  error: string | null;
};

export type ApplicationDevLogsPage = {
  logs: ApplicationDevLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getApplicationDevLogs(
  appId: string,
  limit = 200,
): Promise<ApplicationDevLogEntry[] | null> {
  const paged = await getApplicationDevLogsPaginated({
    appId,
    page: 1,
    pageSize: Math.min(Math.max(limit, 1), 500),
  });
  if (paged === null) return null;
  return paged.logs;
}

export async function getApplicationDevLogsPaginated(input: {
  appId: string;
  page: number;
  pageSize: number;
}): Promise<ApplicationDevLogsPage | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;
  const canViewDevLogs = await canCurrentAccountViewApplicationDevLogs(input.appId);

  if (!canViewDevLogs) return null;

  try {
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.max(1, Math.floor(input.pageSize));
    const where = { appId: input.appId };

    const [total, rows] = await Promise.all([
      prisma.applicationDevLog.count({ where }),
      prisma.applicationDevLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const logs = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      endpoint: row.endpoint,
      method: row.method,
      statusCode: row.statusCode,
      requesterIp: row.requesterIp ?? null,
      origin: row.origin ?? null,
      referer: row.referer ?? null,
      userAgent: row.userAgent ?? null,
      requestBody: row.requestBody ?? null,
      query: row.query ?? null,
      requestMeta: row.requestMeta ?? null,
      responseBody: row.responseBody ?? null,
      error: row.error ?? null,
    }));

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  } catch (error) {
    await logError('database', error, `getApplicationDevLogsPaginated:${input.appId}`);
    return { logs: [], total: 0, page: 1, pageSize: input.pageSize, totalPages: 1 };
  }
}

export async function clearApplicationDevLogs(appId: string): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const [isRootEditor, canEdit] = await Promise.all([
    hasRootApplicationPermission(ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION),
    canCurrentAccountClearApplicationDevLogs(appId),
  ]);

  if (!isRootEditor && !canEdit) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    await prisma.applicationDevLog.deleteMany({
      where: { appId },
    });

    revalidateApplicationLogsRoutes(appId);
    return { success: true };
  } catch (error) {
    await logError('database', error, `clearApplicationDevLogs:${appId}`);
    return { success: false, error: 'Failed to clear application logs.' };
  }
}

export async function getApplicationLogPermissions(appId: string): Promise<{
  canViewLogs: boolean;
  canViewDevLogs: boolean;
}> {
  return {
    canViewLogs: await canCurrentAccountViewApplicationLogs(appId),
    canViewDevLogs: await canCurrentAccountViewApplicationDevLogs(appId),
  };
}
