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
import {
  APPLICATION_MUTATION_BASES,
  APPLICATION_VIEW_BASES,
  applicationAuthzDefinitionTupleSchema,
  canAccessRootApplicationMode,
  canCurrentAccountAccessApplicationByBase,
  canCurrentAccountCreateApplication,
  createApplicationSchema,
  extractPermissionNames,
  getApplicationAuthorization,
  getApplicationRoleGrantsForAccount,
  getCurrentScopedApplicationPermissionNames,
  hasAnyRootApplicationPermission,
  hasAnyPermissionName,
  hasApplicationPermission,
  hasRootApplicationPermission,
  normalizeAccess,
  normalizeEndpoints,
  normalizePolicies,
  normalizeText,
  ownerRoleKeys,
  reserveAvailableApplicationId,
  resolveApplicationAccessForAccount,
  responseAccessSet,
  saveAccessSchema,
  saveEndpointsSchema,
  savePoliciesSchema,
  saveSecretSchema,
  tokenFieldSet,
  updateApplicationStatusSchema,
  type ApplicationRootModeOption,
} from '@/services/applications/manage-shared';
import {
  canCurrentAccountClearApplicationDevLogs,
  canCurrentAccountDeleteApplication,
  canCurrentAccountEditApplicationBasics,
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountRemoveApplicationUser,
  canCurrentAccountResetApplicationRolePush,
  canCurrentAccountUpdateApplicationConfig,
  canCurrentAccountUpdateApplicationUserRole,
  canCurrentAccountViewApplication,
  canCurrentAccountViewApplicationConfig,
  canCurrentAccountViewApplicationDevLogs,
  canCurrentAccountViewApplicationLogs,
  canCurrentAccountViewApplicationRoles,
  canCurrentAccountViewApplicationUsers,
} from '@/services/applications/manage-permissions';

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
          update: {
            name: cap.name,
            description: cap.description,
            appId: 'neup.account',
            scopeFor: cap.scopeFor,
            scopeLevel: cap.scopeLevel,
            approvalPolicy: cap.approvalPolicy,
          },
          create: {
            id: cap.id,
            name: cap.name,
            description: cap.description,
            appId: 'neup.account',
            scopeFor: cap.scopeFor,
            scopeLevel: cap.scopeLevel,
            approvalPolicy: cap.approvalPolicy,
          },
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
          scopeLevel: 'assignable.byTeam',
        },
        create: {
          id: 'application.owner',
          name: 'application.owner',
          description: 'Full ownership of an application.',
          appId: 'neup.account',
          scopeFor: ['for_individual'],
          scopeLevel: 'assignable.byTeam',
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
          scopeLevel: 'assignable.byTeam',
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
