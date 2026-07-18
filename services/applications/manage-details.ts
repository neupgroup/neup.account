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
  tokenFieldSet,
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
import { getApplicationUserStats, type ApplicationUserStats } from '@/services/applications/manage-users';
import { getApplicationLogPermissions } from '@/services/applications/manage-logs';

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

export async function getApplicationDetailsForViewerV2(
  appId: string,
  options?: { rootMode?: boolean; rootPermissionNames?: readonly string[] },
): Promise<ApplicationDetailsV2 | null> {
  const rootPermissionNames = options?.rootPermissionNames ?? [];
  const [isRootViewer, canUseRootMode] = await Promise.all([
    options?.rootMode === true
      ? hasAnyRootApplicationPermission([ROOT_APPLICATION_VIEW_PERMISSION, ...rootPermissionNames])
      : Promise.resolve(false),
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
        const isRootDeleter = options?.rootMode === true
          ? await hasRootApplicationPermission(ROOT_APPLICATION_DELETE_PERMISSION)
          : false;
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
    canCurrentAccountEditApplicationBasics(appId, options),
    canCurrentAccountViewApplicationConfig(appId, options),
    canCurrentAccountViewApplicationRoles(appId, options),
    canCurrentAccountViewApplicationUsers(appId, options),
    canCurrentAccountDeleteApplication(appId, options),
    checkPermissions([...ACCESS_APPLICATION_VIEW_PERMISSIONS]),
    getApplicationLogPermissions(appId, options),
  ]);

  const userStats = canViewUsers ? await getApplicationUserStats(appId, options) : null;

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
