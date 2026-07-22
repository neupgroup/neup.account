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
  APPLICATION_USER_ROLE_ASSIGN_PUBLIC_REQUESTABLE_ROLES_PERMISSION,
  APPLICATION_USER_ROLE_ASSIGN_PUBLIC_ROLES_PERMISSION,
  APPLICATION_USER_ROLE_ASSIGN_ROOT_ROLES_PERMISSION,
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

export async function canCurrentAccountManageApplicationRoles(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.manage'], ROOT_APPLICATION_ROLES_MANAGE_PERMISSION, undefined, options);
}

export async function canCurrentAccountEditApplicationBasics(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['basics.edit'], ROOT_APPLICATION_BASICS_EDIT_PERMISSION, undefined, options);
}

export async function canCurrentAccountDeleteApplication(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['delete'], ROOT_APPLICATION_DELETE_PERMISSION, undefined, options);
}

export async function canCurrentAccountViewApplicationConfig(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  const canUpdate = await canCurrentAccountUpdateApplicationConfig(appId, options);
  if (canUpdate) return true;
  return canCurrentAccountAccessApplicationByBase(appId, ['config.view'], ROOT_APPLICATION_CONFIG_VIEW_PERMISSION, undefined, options);
}

export async function canCurrentAccountUpdateApplicationConfig(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['config.update'], ROOT_APPLICATION_CONFIG_UPDATE_PERMISSION, undefined, options);
}

export async function canCurrentAccountViewApplicationRoles(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  const [canManageRoles, canResetPush] = await Promise.all([
    canCurrentAccountManageApplicationRoles(appId, options),
    canCurrentAccountResetApplicationRolePush(appId, options),
  ]);
  if (canManageRoles || canResetPush) return true;
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.view'], ROOT_APPLICATION_ROLES_VIEW_PERMISSION, undefined, options);
}

export async function canCurrentAccountResetApplicationRolePush(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['roles.resetPush'], ROOT_APPLICATION_ROLES_RESET_PUSH_PERMISSION, undefined, options);
}

export async function canCurrentAccountViewApplicationUsers(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  const [canRemoveUser, canUpdateRole] = await Promise.all([
    canCurrentAccountRemoveApplicationUser(appId, options),
    canCurrentAccountUpdateApplicationUserRole(appId, options),
  ]);
  if (canRemoveUser || canUpdateRole) return true;
  return canCurrentAccountAccessApplicationByBase(
    appId,
    ['account.view', 'user.view'],
    ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
    ROOT_APPLICATION_USER_VIEW_PERMISSION,
    options,
  );
}

export async function canCurrentAccountRemoveApplicationUser(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(
    appId,
    ['account.delete', 'user.remove'],
    ROOT_APPLICATION_ACCOUNT_DELETE_PERMISSION,
    ROOT_APPLICATION_USER_REMOVE_PERMISSION,
    options,
  );
}

export async function canCurrentAccountUpdateApplicationUserRole(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  const [canUpdateRole, canAssignScopedRolesAsRoot] = await Promise.all([
    canCurrentAccountAccessApplicationByBase(
      appId,
      [
        'account.role.update',
        'account.connection.assign',
        'user.updateRole',
        'user.role.assignPublicRoles',
        'user.role.assignPublicRequestableRoles',
        'user.role.assignRootRoles',
      ],
      ROOT_APPLICATION_ACCOUNT_ROLE_UPDATE_PERMISSION,
      ROOT_APPLICATION_USER_UPDATE_ROLE_PERMISSION,
      options,
    ),
    options?.rootMode === true
      ? hasAnyRootApplicationPermission([
          APPLICATION_USER_ROLE_ASSIGN_PUBLIC_ROLES_PERMISSION,
          APPLICATION_USER_ROLE_ASSIGN_PUBLIC_REQUESTABLE_ROLES_PERMISSION,
          APPLICATION_USER_ROLE_ASSIGN_ROOT_ROLES_PERMISSION,
        ])
      : Promise.resolve(false),
  ]);

  return canUpdateRole || canAssignScopedRolesAsRoot;
}

export async function canCurrentAccountViewApplicationLogs(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['logs.view'], ROOT_APPLICATION_LOGS_VIEW_PERMISSION, undefined, options);
}

export async function canCurrentAccountViewApplicationDevLogs(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['devlogs.view'], ROOT_APPLICATION_DEVLOGS_VIEW_PERMISSION, undefined, options);
}

export async function canCurrentAccountClearApplicationDevLogs(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, ['devlogs.clear'], ROOT_APPLICATION_DEVLOGS_CLEAR_PERMISSION, undefined, options);
}

export async function canCurrentAccountViewApplication(appId: string, options?: ApplicationRootModeOption): Promise<boolean> {
  return canCurrentAccountAccessApplicationByBase(appId, APPLICATION_VIEW_BASES, ROOT_APPLICATION_VIEW_PERMISSION, undefined, options);
}

// ---------------------------------------------------------------------------
// Meta update (owner — name, description, icon, website only, no status)
// ---------------------------------------------------------------------------
