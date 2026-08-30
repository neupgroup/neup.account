import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { permission } from '@/.neup/logica/permission';
import { Prisma } from '@/.neup/core/database/prisma';
import prisma from '@/.neup/core/database/prisma';
import { getAccountSelectorContext } from '@/services/account/accountSelector';
import { getActiveAccountId, getPersonalAccountId } from '@/services/account/verify';
import { ACCESS_APPLICATION_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { checkPermissions } from '@/services/user';
import { logError } from '@/.neup/logica/logger/files';
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
