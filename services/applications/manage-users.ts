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
  roleRequestTarget,
} from '@/services/role-scopes';
import {
  deriveLegacyRoleScopesFromPolicy,
  type AuthzScopeLevel,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
  roleMatchesAssignmentModesPolicy,
  scopeForForAccountType,
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

export type ApplicationUserStats = {
  total: number;
  last24h: number;
  lastWeek: number;
  lastMonth: number;
};

export async function getApplicationUserStats(
  appId: string,
  options?: ApplicationRootModeOption,
): Promise<ApplicationUserStats | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canViewUsers = await canCurrentAccountViewApplicationUsers(appId, options);
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

const APPLICATION_USER_ROLE_ASSIGN_PERMISSION_BY_SCOPE_LEVEL = {
  'assignable.publicly': APPLICATION_USER_ROLE_ASSIGN_PUBLIC_ROLES_PERMISSION,
  'assignable.publicly.byRequest': APPLICATION_USER_ROLE_ASSIGN_PUBLIC_REQUESTABLE_ROLES_PERMISSION,
  'assignable.byRoot': APPLICATION_USER_ROLE_ASSIGN_ROOT_ROLES_PERMISSION,
} satisfies Partial<Record<AuthzScopeLevel, string>>;

const APPLICATION_USER_ROLE_ASSIGNABLE_SCOPE_LEVELS = Object.keys(
  APPLICATION_USER_ROLE_ASSIGN_PERMISSION_BY_SCOPE_LEVEL,
) as AuthzScopeLevel[];

async function getCurrentApplicationRoleAssignmentScopeLevels(
  appId: string,
  options?: ApplicationRootModeOption,
): Promise<Set<AuthzScopeLevel>> {
  const accountId = await getActiveAccountId();
  if (!accountId) return new Set();

  const permissionEntries = Object.entries(APPLICATION_USER_ROLE_ASSIGN_PERMISSION_BY_SCOPE_LEVEL) as Array<[AuthzScopeLevel, string]>;
  const [appPermissionResults, rootPermissionResults] = await Promise.all([
    Promise.all(permissionEntries.map(([, permissionName]) => hasApplicationPermission(accountId, appId, [permissionName]))),
    options?.rootMode === true
      ? Promise.all(permissionEntries.map(([, permissionName]) => hasRootApplicationPermission(permissionName)))
      : Promise.resolve(permissionEntries.map(() => false)),
  ]);

  return new Set(
    permissionEntries.flatMap(([scopeLevel], index) =>
      appPermissionResults[index] || rootPermissionResults[index] ? [scopeLevel] : [],
    ),
  );
}

function canAssignRoleForApplicationUser(input: {
  accountType: string | null | undefined;
  role: { scopeFor: unknown; scopeLevel: unknown };
  allowedScopeLevels: ReadonlySet<AuthzScopeLevel>;
}): boolean {
  const requiredScopeFor = scopeForForAccountType(input.accountType);
  if (!requiredScopeFor) return false;

  const roleScopeFor = normalizeAuthzScopeFor(input.role.scopeFor);
  const roleScopeLevel = normalizeSingleAuthzScopeLevel(input.role.scopeLevel);

  return roleScopeFor.includes(requiredScopeFor)
    && APPLICATION_USER_ROLE_ASSIGNABLE_SCOPE_LEVELS.includes(roleScopeLevel)
    && input.allowedScopeLevels.has(roleScopeLevel);
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
  rootMode?: boolean;
}): Promise<AppUsersPage> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { users: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  const canView = await canCurrentAccountViewApplicationUsers(params.appId, { rootMode: params.rootMode });
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
  rootMode?: boolean;
}): Promise<AppUserConnectionDetails | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const canView = await canCurrentAccountViewApplicationUsers(params.appId, { rootMode: params.rootMode });
  if (!canView) return null;

  try {
    const [row, pendingRequests] = await Promise.all([
      prisma.connection.findFirst({
        where: {
          appId: params.appId,
          OR: [
            { id: params.connectionId },
            { accountId: params.connectionId },
          ],
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

export async function getApplicationRoleOptions(appId: string, targetAccountType?: string | null, options?: ApplicationRootModeOption): Promise<AppRoleOption[]> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  const [canView, allowedScopeLevels] = await Promise.all([
    canCurrentAccountViewApplicationUsers(appId, options),
    getCurrentApplicationRoleAssignmentScopeLevels(appId, options),
  ]);
  if (!canView || allowedScopeLevels.size === 0) return [];

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
      return normalizedRoles.filter((role) =>
        hasUsableRoleScope(role.scope) &&
        APPLICATION_USER_ROLE_ASSIGNABLE_SCOPE_LEVELS.includes(normalizeSingleAuthzScopeLevel((role as any).scopeLevel)) &&
        allowedScopeLevels.has(normalizeSingleAuthzScopeLevel((role as any).scopeLevel)),
      );
    }

    return normalizedRoles.filter((role) => {
      if (!hasUsableRoleScope(role.scope)) return false;
      return canAssignRoleForApplicationUser({
        accountType: targetAccountType,
        role: {
          scopeFor: (role as any).scopeFor ?? [],
          scopeLevel: (role as any).scopeLevel ?? 'assignable.byTeam',
        },
        allowedScopeLevels,
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
  rootMode?: boolean;
}): Promise<{ success: boolean; error?: string; pendingApproval?: boolean; roleIds?: string[]; pendingRoleIds?: string[] }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canManageRoles = await canCurrentAccountUpdateApplicationUserRole(input.appId, { rootMode: input.rootMode === true });
  const allowedScopeLevels = await getCurrentApplicationRoleAssignmentScopeLevels(input.appId, { rootMode: input.rootMode === true });
  if (!canManageRoles || allowedScopeLevels.size === 0) {
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
      canAssignRoleForApplicationUser({
        accountType: connection.account.accountType,
        role,
        allowedScopeLevels,
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
          .filter((row) =>
            canAssignRoleForApplicationUser({
              accountType: connection.account.accountType,
              role: row.role,
              allowedScopeLevels,
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
