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
import { extractGenderFromDetails, resolveDisplayImage } from '@/inapp/display-image';
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

export async function getApplicationLogPermissions(appId: string, options?: ApplicationRootModeOption): Promise<{
  canViewLogs: boolean;
  canViewDevLogs: boolean;
}> {
  return {
    canViewLogs: await canCurrentAccountViewApplicationLogs(appId, options),
    canViewDevLogs: await canCurrentAccountViewApplicationDevLogs(appId, options),
  };
}

export async function logRootApplicationActivity(appId: string, page: string): Promise<void> {
  const accountId = await getActiveAccountId();
  if (!accountId) return;

  await logActivity(appId, `Root application access: ${page}`, 'Success', undefined, accountId);
}
