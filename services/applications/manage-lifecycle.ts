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
