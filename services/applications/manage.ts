'use server';

import { randomUUID } from 'crypto';
import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { dispatchAccountUpdatedEvent } from '@/services/applications/account-update-events';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { activeAccessWhere, ensureAccessGrant } from '@/services/access-model';
import {
  APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_DELETE_PERMISSION,
  ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_EDIT_PERMISSION,
  ROOT_APPLICATION_LOGS_VIEW_PERMISSION,
  ROOT_APPLICATION_VIEW_PERMISSION,
  getApplicationPermissionNames,
  type ApplicationPermissionBase,
  type ApplicationPermissionAudience,
} from '@/services/applications/permission-definitions';
import { canAssignRoleScopeToAccount } from '@/services/role-scopes';
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
import { ACCESS_VIEW_PERMISSIONS } from '@/core/auth/access-view-permissions';

const responseAccessSet = new Set<ApplicationAccessField>(applicationResponseFields);
const tokenFieldSet = new Set<ApplicationAccessField>(applicationTokenFields);
const ROOT_PERMISSION_SCOPE = 'individual.root';

const createApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Application name is required.').max(120, 'Application name is too long.'),
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

const viewRoleKeys = new Set(['application.owner', 'application.view', 'app.view', 'application.edit', 'app.edit', 'application.manage', 'app.manage', 'manage', '*']);
const editRoleKeys = new Set(['application.owner', 'application.edit', 'app.edit', 'application.manage', 'app.manage', 'manage', '*']);
const ownerRoleKeys = new Set(['application.owner', 'app.owner', 'owner', '*']);
const APPLICATION_NON_ROOT_AUDIENCES: ApplicationPermissionAudience[] = ['public', 'managed'];

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

    const normalizedRoles = new Set(roleRows.map((row) => row.roleId.trim().toLowerCase()));
    const grantedPermissions = new Set(roleRows.flatMap((row) => extractPermissionNames(row.permissions)));
    const permissionDrivenEdit = hasAnyPermissionName(
      grantedPermissions,
      getApplicationPermissionNames(['edit', 'delete', 'roles.manage'], APPLICATION_NON_ROOT_AUDIENCES),
    );
    const permissionDrivenView = hasAnyPermissionName(
      grantedPermissions,
      getApplicationPermissionNames(['view', 'roles.view'], APPLICATION_NON_ROOT_AUDIENCES),
    );
    const roleDrivenEdit = Array.from(normalizedRoles).some((role) => editRoleKeys.has(role));
    const canEdit = permissionDrivenEdit || roleDrivenEdit;
    const canView = canEdit || permissionDrivenView || Array.from(normalizedRoles).some((role) => viewRoleKeys.has(role));

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
      checkPermissions([ROOT_APPLICATION_DELETE_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
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
export async function createManagedApplication(input: { name: string }) {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application name.' };
  }

  const canCreateApplication = false;
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
      const permissionDefinitions = APPLICATION_PUBLIC_AND_MANAGED_PERMISSION_DEFINITIONS.map((permission, index) => ({
        id: `cap-appowner-${index + 1}-${permission.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`,
        ...permission,
      }));
      const permissions: Array<{ id: string; name: string; description: string | null; scope: string }> = [];
      for (const cap of permissionDefinitions) {
        const permission = await tx.authzPermission.upsert({
          where: { name_appId: { name: cap.name, appId: 'neup.account' } },
          update: { name: cap.name, description: cap.description, appId: 'neup.account', scope: cap.scope, tag: cap.tag },
          create: { id: cap.id, name: cap.name, description: cap.description, appId: 'neup.account', scope: cap.scope, tag: cap.tag },
          select: { id: true, name: true, description: true, scope: true },
        });
        permissions.push(permission);
      }
      await tx.authzRole.upsert({
        where: { id: 'application.owner' },
        update: { name: 'application.owner', description: 'Full ownership of an application.', appId: 'neup.account', scope: 'public' },
        create: { id: 'application.owner', name: 'application.owner', description: 'Full ownership of an application.', appId: 'neup.account', scope: 'public' },
      });
      await tx.authzRolePermissionMap.deleteMany({
        where: { roleId: 'application.owner' },
      });
      await tx.authzRolePermissionMap.createMany({
        data: permissions.map((cap) => ({ roleId: 'application.owner', permissionId: cap.id })),
        skipDuplicates: true,
      });
      await tx.authzRole.update({
        where: { id: 'application.owner' },
        data: {
          permissions: permissions.map((permission) => permission.name),
        },
      });
      const createdApp = await tx.application.create({
        data: {
          id: randomUUID(),
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
            scope: permission.scope,
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
        role: { select: { name: true } },
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

      const canView = normalizedCandidates.some((role) => viewRoleKeys.has(role));
      const isOwner = normalizedCandidates.some((role) => ownerRoleKeys.has(role));

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

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
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

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
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

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
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

  try {
    const authorization = await getApplicationAuthorization(accountId, parsed.data.appId);
    if (!authorization.exists) {
      return { success: false, error: 'Application not found.' };
    }
    if (!authorization.canEdit) {
      return { success: false, error: 'Permission denied.' };
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
    checkPermissions([ROOT_APPLICATION_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
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

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

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

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

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

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

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

  try {
    const authorization = await getApplicationAuthorization(accountId, input.appId);
    if (!authorization.exists) return { success: false, error: 'Application not found.' };
    if (!authorization.canEdit) return { success: false, error: 'Permission denied.' };

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
export async function getApplicationDetailsForViewerV2(appId: string): Promise<ApplicationDetailsV2 | null> {
  await requireAnyPermission404(ACCESS_VIEW_PERMISSIONS);
  const activeAccountId = await getActiveAccountId();
  if (!activeAccountId) return null;

  const personalAccountId = await getPersonalAccountId();
  const deletePermissionNames = await getCurrentScopedApplicationPermissionNames(activeAccountId, ['delete']);

  try {
    const isRootViewer = await checkPermissions([ROOT_APPLICATION_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE });

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
      hasApplicationPermission(activeAccountId, appId, deletePermissionNames),
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

export async function canCurrentAccountManageApplicationRoles(appId: string): Promise<boolean> {
  const accountId = await getActiveAccountId();
  if (!accountId) return false;

  const [isRootManager, rolePermissionNames] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    getCurrentScopedApplicationPermissionNames(accountId, ['roles.manage']),
  ]);

  if (isRootManager) return true;
  return hasApplicationPermission(accountId, appId, rolePermissionNames);
}

async function canCurrentAccountEditApplication(appId: string): Promise<boolean> {
  const accountId = await getActiveAccountId();
  if (!accountId) return false;

  const [isRootEditor, permissionNames] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    getCurrentScopedApplicationPermissionNames(accountId, ['edit']),
  ]);

  if (isRootEditor) return true;
  return hasApplicationPermission(accountId, appId, permissionNames);
}

async function canCurrentAccountViewApplication(appId: string): Promise<boolean> {
  const accountId = await getActiveAccountId();
  if (!accountId) return false;

  const [isRootViewer, permissionNames] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    getCurrentScopedApplicationPermissionNames(accountId, ['view', 'edit', 'delete', 'roles.view', 'roles.manage']),
  ]);

  if (isRootViewer) return true;
  return hasApplicationPermission(accountId, appId, permissionNames);
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

  const canEdit = await canCurrentAccountEditApplication(appId);
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

  const canEdit = await canCurrentAccountEditApplication(appId);
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
  /** null = direct grant; string = portfolio name the grant came through */
  via: null | string;
};

export type AppPortfolioEntry = {
  parentPortfolioId: string;
  portfolioName: string;
};

export type AppOwnershipData = {
  owners: AppOwnerEntry[];
  accessGrants: AppAccessEntry[];
  portfolios: AppPortfolioEntry[];
};

/**
 * Function getAppOwnershipData.
 *
 * Returns the owner(s), all accounts with access grants, and any portfolios
 * this application belongs to. Accessible to the app owner and root viewers.
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
        parentPortfolioId: true,
        parentPortfolio: { select: { id: true, name: true } },
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

    const appPortfolioGrants = await prisma.access.findMany({
      where: {
        parentPortfolioId: { not: null },
        accessApplicationId: appId,
        ...activeAccessWhere(),
      },
      select: {
        parentPortfolioId: true,
        parentPortfolio: { select: { id: true, name: true } },
      },
      distinct: ['parentPortfolioId'],
    });

    // Also check AuthzAccountAccessGrant portfolios
    const portfolioIds = new Set<string>();
    const portfolioMap = new Map<string, string>();

    for (const g of grants) {
      if (g.parentPortfolioId && g.parentPortfolio) {
        portfolioIds.add(g.parentPortfolioId);
        portfolioMap.set(g.parentPortfolioId, g.parentPortfolio.name);
      }
    }
    for (const g of appPortfolioGrants) {
      if (g.parentPortfolioId && g.parentPortfolio) {
        portfolioIds.add(g.parentPortfolioId);
        portfolioMap.set(g.parentPortfolioId, g.parentPortfolio.name);
      }
    }

    const portfolios: AppPortfolioEntry[] = Array.from(portfolioIds).map((id) => ({
      parentPortfolioId: id,
      portfolioName: portfolioMap.get(id) ?? id,
    }));

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
            via: g.parentPortfolioId && g.parentPortfolio ? g.parentPortfolio.name : null,
          });
        }
        const entry = accessMap.get(t.id)!;
        if (!entry.roles.includes(g.roleId)) {
          entry.roles.push(g.roleId);
        }
        // If any grant for this account came via a portfolio, mark it
        if (g.parentPortfolioId && g.parentPortfolio && entry.via === null) {
          entry.via = g.parentPortfolio.name;
        }
      }
    }

    return {
      owners: Array.from(ownerMap.values()),
      accessGrants: Array.from(accessMap.values()),
      portfolios,
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

/**
 * Returns user counts for an application based on ApplicationConnection records.
 * Accessible to any authenticated user who can view the application.
 */
export async function getApplicationUserStats(appId: string): Promise<ApplicationUserStats | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  // Verify the app exists and the caller has at least view access
  const authorization = await getApplicationAuthorization(accountId, appId);
  if (!authorization.exists || !authorization.canView) return null;

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

const SEARCHABLE_APP_USER_ACCOUNT_TYPES = new Set(['individual', 'brand', 'branch', 'dependent', 'guest', 'root']);
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
        parsed.accountType = accountType;
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
  scope: string | null;
};

function hasUsableRoleScope(scope: string | null | undefined): boolean {
  return typeof scope === 'string' && scope.trim().length > 0;
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

  const canView = await canCurrentAccountViewApplication(params.appId);
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
      connectionWhere.OR = [
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
      ];
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
              accountType: true,
              isVerified: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const users: AppUserEntry[] = rows.map((r) => ({
      connectionId: r.id,
      accountId: r.account.id,
      displayName: r.account.displayName,
      displayImage: r.account.displayImage,
      accountType: r.account.accountType,
      isVerified: r.account.isVerified,
      connectedAt: r.connectedAt,
      status: r.account.status,
    }));

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

  const canView = await canCurrentAccountViewApplication(params.appId);
  if (!canView) return null;

  try {
    const row = await prisma.connection.findFirst({
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
            accountType: true,
            isVerified: true,
            status: true,
            createdAt: true,
            neupIds: {
              where: { isPrimary: true },
              take: 1,
              select: { neupId: true },
            },
          },
        },
      },
    });

    if (!row) return null;

    return {
      connectionId: row.id,
      appId: row.appId,
      accountId: row.accountId,
      connectedAt: row.connectedAt,
      connectionStatus: row.status,
      roleId: row.roleId,
      displayName: row.account.displayName,
      displayImage: row.account.displayImage,
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

  const isRootEditor = await checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE });
  const canView = await canCurrentAccountViewApplication(appId);
  if (!canView) return [];

  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
      },
    });

    if (!targetAccountType) return roles.filter((role) => hasUsableRoleScope(role.scope));

    return roles.filter((role) => {
      if (!hasUsableRoleScope(role.scope)) return false;
      const modes = isRootEditor
        ? ['manageable', 'toApprove', 'root'] as const
        : ['manageable', 'toApprove'] as const;
      return canAssignRoleScopeToAccount(role.scope, targetAccountType, [...modes]);
    });
  } catch (error) {
    await logError('database', error, `getApplicationRoleOptions:${appId}`);
    return [];
  }
}

export async function assignApplicationConnectionRole(input: {
  appId: string;
  connectionId: string;
  roleId: string;
}): Promise<{ success: boolean; error?: string; pendingApproval?: boolean }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const [isRootEditor, canManageRoles] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    canCurrentAccountManageApplicationRoles(input.appId),
  ]);
  if (!isRootEditor && !canManageRoles) {
    return { success: false, error: 'Permission denied.' };
  }

  try {
    const [connection, role] = await Promise.all([
      prisma.connection.findFirst({
        where: { id: input.connectionId, appId: input.appId },
        select: {
          id: true,
          accountId: true,
          account: { select: { accountType: true } },
        },
      }),
      prisma.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, name: true, scope: true },
      }),
    ]);

    if (!connection) return { success: false, error: 'Connection not found.' };
    if (!role) return { success: false, error: 'Role not found for this application.' };
    if (!hasUsableRoleScope(role.scope)) {
      return { success: false, error: 'Roles without a scope cannot be assigned to a user.' };
    }

    const canAssignImmediately =
      canAssignRoleScopeToAccount(role.scope, connection.account.accountType, ['manageable']) ||
      (isRootEditor && canAssignRoleScopeToAccount(role.scope, connection.account.accountType, ['root']));

    if (!canAssignImmediately) {
      if (!canAssignRoleScopeToAccount(role.scope, connection.account.accountType, ['toApprove'])) {
        return { success: false, error: 'This role scope cannot be assigned to this account type.' };
      }

      await prisma.request.create({
        data: {
          senderId: accountId,
          recipientId: accountId,
          action: 'applicationRoleRequest',
          type: 'applicationRoleRequest',
          data: {
            appId: input.appId,
            accountId: connection.accountId,
            connectionId: connection.id,
            roleIds: [role.id],
            roles: [{ id: role.id, name: role.name, scope: role.scope }],
            assignmentKind: 'connectionRole',
          },
        },
      });

      revalidateApplicationRequestsRoutes(input.appId);
      return { success: true, pendingApproval: true };
    }

    await prisma.connection.update({
      where: { id: input.connectionId },
      data: { roleId: input.roleId },
    });

    await dispatchAccountUpdatedEvent({
      accountId: connection.accountId,
      changedFields: ['role'],
    });

    revalidateApplicationUsersRoutes(input.appId, input.connectionId);

    return { success: true };
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

  const canEdit = await canCurrentAccountEditApplication(appId);
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

  const { appId, secretKey, access, party, allowDevMode, allowDevIpMode } = parsed.data;
  const sanitizedAccess = enforcePartyFieldRules(
    party,
    access.filter((field) => responseAccessSet.has(field)),
  );
  const fixedTokenFields: ApplicationAccessField[] = [];

  const canEdit = await canCurrentAccountEditApplication(appId);
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
export async function getAppConfigData(appId: string): Promise<{
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
  status: string;
} | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canEdit = await canCurrentAccountEditApplication(appId);
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
      status: app.status ?? 'development',
    };
  } catch (error) {
    await logError('database', error, `getAppConfigData:${appId}`);
    return null;
  }
}

export async function saveAccountUpdateWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canEdit = await canCurrentAccountEditApplication(input.appId);
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

  const canEdit = await canCurrentAccountEditApplication(input.appId);
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
  const devLogPermissionNames = await getCurrentScopedApplicationPermissionNames(accountId, ['devlogs.view']);

  const [isRootViewer, canViewDevLogs] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    hasApplicationPermission(accountId, input.appId, devLogPermissionNames),
  ]);

  if (!isRootViewer && !canViewDevLogs) return null;

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
    checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    canCurrentAccountEditApplication(appId),
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
  const accountId = await getActiveAccountId();
  if (!accountId) return { canViewLogs: false, canViewDevLogs: false };
  const [logPermissionNames, devLogPermissionNames] = await Promise.all([
    getCurrentScopedApplicationPermissionNames(accountId, ['logs.view']),
    getCurrentScopedApplicationPermissionNames(accountId, ['devlogs.view']),
  ]);

  const [isRootLogsViewer, isRootDevLogsViewer] = await Promise.all([
    checkPermissions([ROOT_APPLICATION_LOGS_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
    checkPermissions([ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE }),
  ]);

  const [canViewLogs, canViewDevLogs] = await Promise.all([
    hasApplicationPermission(accountId, appId, logPermissionNames),
    hasApplicationPermission(accountId, appId, devLogPermissionNames),
  ]);

  return {
    canViewLogs: isRootLogsViewer || canViewLogs,
    canViewDevLogs: isRootDevLogsViewer || canViewDevLogs,
  };
}
