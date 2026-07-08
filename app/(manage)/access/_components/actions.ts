'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { Prisma } from '@/prisma/generated/client';
import { checkPermissions, getUserProfile, isRootUser } from '@/services/user';
import { getPersonalAccountId, getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { assignAssetMemberRole, getRolesForAsset } from '@/services/manage/access/assets';
import { BRAND_OWNER_ROLE_ID } from '@/core/auth/brand-roles';
import { resolveNeupAccountPermissionCandidates } from '@/services/neup-account/permission-catalog';
import { roleMatchesAccountTypeScopePolicy, roleMatchesAssignmentModesPolicy } from '@/services/applications/authz-scope-policy';
import {
  ACCESS_TEAM_ADD_PERMISSIONS,
  ACCESS_TEAM_REMOVE_PERMISSIONS,
} from '@/core/auth/access-view-permissions';
import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';

const servicePermissions = [
  permission('access.team.add.self', 'for_individual', 'service'),
  permission('access.team.remove.self', 'for_individual', 'service'),
];

function hasAllContextPermissions(
  grantedPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean {
  const granted = new Set(grantedPermissions);

  return requiredPermissions.every((requiredPermission) => {
    const candidates = new Set([
      ...resolveNeupAccountPermissionCandidates(requiredPermission, 'managed'),
      ...resolveNeupAccountPermissionCandidates(requiredPermission, 'selfOrRoot'),
    ]);

    return Array.from(candidates).some((candidate) => granted.has(candidate));
  });
}

/**
 * ::neup.documentation::manage-access-actions-module
 * ::title Asset Access Actions
 *
 * Server actions for resolving members, listing assets, and assigning or inviting asset members from the access UI.
 *
 * ::public
 *
 * This module powers asset-member lookup, selectable-asset discovery, and the direct assign/invite actions used by manage access components. Direct account actions resolve `selectedProfile` before reading or mutating access.
 *
 * ::public end
 *
 * ::private
 *
 * The implementation enforces account-type restrictions, assignment-mode compatibility, and role/permission rules before mutating asset access.
 *
 * ::private end
 *
 * ::end
 */
export type ResolvedAccount = {
  accountId: string;
  displayName: string;
};

export async function resolveNeupId(
  neupId: string,
): Promise<{ success: true; account: ResolvedAccount } | { success: false; error: string }> {
  /**
   * ::neup.documentation::manage-access-actions-resolve-neup-id
   * ::function resolveNeupId(neupId)
   *
   * Resolves a NeupID to an inviteable individual account.
   *
   * ::public
   *
   * Only individual accounts are considered valid targets for the asset invitation flow.
   *
   * ::public end
   *
   * ::private
   *
   * The helper lowercases the NeupID before lookup and returns a fallback display label when profile data is incomplete.
   *
   * ::private end
   *
   * ::end
   */
  const normalized = neupId.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return { success: false, error: 'NeupID must be at least 3 characters.' };
  }

  const record = await prisma.neupId.findUnique({
    where: { id: normalized },
    select: {
      accountId: true,
      account: { select: { accountType: true } },
    },
  });

  if (!record) {
    return { success: false, error: 'No account found with that NeupID.' };
  }
  if (record.account.accountType !== 'individual') {
    return { success: false, error: 'Only individual accounts can be invited to a team.' };
  }

  const profile = await getUserProfile(record.accountId);
  const displayName =
    profile?.nameDisplay ||
    (profile?.nameFirst || profile?.nameLast
      ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
      : null) ||
    normalized;

  return {
    success: true,
    account: { accountId: record.accountId, displayName },
  };
}

// ── Selectable asset types ────────────────────────────────────────────────────

export type SelectableAsset = {
  /** The ID that goes into portfolioAsset.assetId */
  assetId: string;
  /** Human-readable name */
  name: string;
  /** The assetType string stored in portfolioAsset.access_type */
  assetType: string;
  /** Optional secondary label */
  subtitle?: string;
};

/**
 * Returns all brand accounts the personal user owns.
 */
async function getBrandAssets(): Promise<SelectableAsset[]> {
  try {
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) return [];

    const grants = await prisma.access.findMany({
      where: {
        memberAccountId: personalAccountId,
        roleId: BRAND_OWNER_ROLE_ID,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: { appId: 'neup.account' },
      },
      select: { parentAccountId: true },
    });

    const ids = grants
      .map((g) => g.parentAccountId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return [];

    const accounts = await prisma.account.findMany({
      where: { id: { in: ids }, accountType: 'brand' },
      select: { id: true, displayName: true },
    });

    return accounts.map((a) => ({
      assetId: a.id,
      name: a.displayName || 'Unnamed Brand',
      assetType: 'brand_account',
    }));
  } catch (error) {
    await logError('database', error, 'getBrandAssets');
    return [];
  }
}

/**
 * Returns all subbrand accounts under the currently active brand account.
 */
async function getSubbrandAssets(): Promise<SelectableAsset[]> {
  try {
    const activeAccountId = await getActiveAccountId();
    if (!activeAccountId) return [];

    // Subbrands are owned by the active brand account — find them via AccountOwnership.
    const subbrands = await prisma.account.findMany({
      where: {
        accountType: { in: ['branch', 'subbrand'] },
        parentOwnerships: {
          some: { parentId: activeAccountId },
        },
      },
      include: { neupIds: { where: { isPrimary: true }, select: { id: true } } },
    });

    return subbrands.map((a) => ({
      assetId: a.id,
      name: a.displayName || 'Unnamed Subbrand',
      assetType: 'subbrand_account',
      subtitle: a.neupIds[0]?.id,
    }));
  } catch (error) {
    await logError('database', error, 'getSubbrandAssets');
    return [];
  }
}

/**
 * Returns all applications the active account owns.
 */
async function getApplicationAssets(): Promise<SelectableAsset[]> {
  try {
    const accountId = await getActiveAccountId();
    if (!accountId) return [];

    const grants = await prisma.access.findMany({
      where: {
        roleId: 'application.owner',
        memberAccountId: accountId,
        parentAccountId: accountId,
        assetApplicationId: { not: null },
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      },
      select: {
        assetApplicationId: true,
      },
    });

    const appIds = Array.from(
      new Set(
        grants
          .map((g) => g.assetApplicationId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (appIds.length === 0) return [];

    const apps = await prisma.application.findMany({
      where: { id: { in: appIds } },
      select: { id: true, name: true, status: true },
    });

    return apps.map((app) => ({
        assetId: app.id,
        name: app.name,
        assetType: 'application',
        subtitle: app.status ?? undefined,
      }));
  } catch (error) {
    await logError('database', error, 'getApplicationAssets');
    return [];
  }
}

export type AssetType = 'brand_account' | 'subbrand_account' | 'application';

export async function getSelectableAssets(
  type: AssetType,
  excludeAssetIds?: string[],
): Promise<SelectableAsset[]> {
  /**
   * ::neup.documentation::manage-access-actions-get-selectable-assets
   * ::function getSelectableAssets(type, excludeAssetIds)
   *
   * Returns the assets the current account may select for assignment flows.
   *
   * ::public
   *
   * Supported asset types currently include brand accounts, subbrand accounts, and owned applications.
   *
   * ::public end
   *
   * ::private
   *
   * Excluded asset IDs are filtered after the asset-type-specific source query is resolved.
   *
   * ::private end
   *
   * ::end
   */
  let assets: SelectableAsset[];
  switch (type) {
    case 'brand_account':
      assets = await getBrandAssets();
      break;
    case 'subbrand_account':
      assets = await getSubbrandAssets();
      break;
    case 'application':
      assets = await getApplicationAssets();
      break;
  }

  if (excludeAssetIds && excludeAssetIds.length > 0) {
    const excluded = new Set(excludeAssetIds);
    return assets.filter((a) => !excluded.has(a.assetId));
  }

  return assets;
}

// ── Member removal & invitation cancellation ──────────────────────────────────

import { revalidatePath } from 'next/cache';
import { logActivity } from '@/services/log-actions';
import { removeAssetGroupMember } from '@/services/manage/access/assets';
import { ensureAccessGrant, extractRolePermissionNames } from '@/services/access-model';

const DIRECT_CUSTOM_ROLE_PREFIX = 'account.access.';

function normalizeStringList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function getSelfManagedDirectRoleIds(): Promise<Set<string> | null> {
  const [activeAccountId, personalAccountId] = await Promise.all([
    getActiveAccountId(),
    getPersonalAccountId(),
  ]);

  if (!activeAccountId || !personalAccountId || activeAccountId !== personalAccountId) {
    return null;
  }

  const account = await prisma.account.findUnique({
    where: { id: activeAccountId },
    select: { accountType: true },
  });

  if (account?.accountType !== 'individual') {
    return null;
  }

  const accessRows = await prisma.access.findMany({
    where: {
      memberAccountId: activeAccountId,
      parentAccountId: activeAccountId,
      accessType: 'acc_self',
      status: 'active',
      OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      role: {
        appId: 'neup.account',
        name: { not: { startsWith: DIRECT_CUSTOM_ROLE_PREFIX } },
      },
    },
    select: { roleId: true },
  });

  return new Set(accessRows.map((row) => row.roleId));
}

async function rolePermissionNames(roleIds: string[]): Promise<Map<string, string[]>> {
  if (roleIds.length === 0) return new Map();

  const mappings = await prisma.authzRolePermissionMap.findMany({
    where: { roleId: { in: roleIds } },
    select: {
      roleId: true,
      permission: { select: { name: true } },
    },
  });

  const byRole = new Map<string, string[]>();
  for (const mapping of mappings) {
    const current = byRole.get(mapping.roleId) ?? [];
    current.push(mapping.permission.name);
    byRole.set(mapping.roleId, current);
  }

  return byRole;
}

export type DirectAccessAssignableRole = {
  id: string;
  name: string;
  description?: string;
};

type RawDirectAssignableRoleRow = {
  id: string;
  name: string;
  description: string | null;
  scopeForText: string | null;
  scopeLevelText: string | null;
  permissionsText: string | null;
};

function parseStoredJsonText(value: string | null | undefined): Prisma.JsonValue | null {
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

async function loadAuthzRolesWithMalformedJsonFallback(input: {
  roleIds?: string[];
  allowedRoleIds?: Set<string> | null;
}): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  scopeFor: Prisma.JsonValue | null;
  scopeLevel: Prisma.JsonValue | null;
  permissions: Prisma.JsonValue | null;
}>> {
  const filters: Prisma.Sql[] = [
    Prisma.sql`r."app_id" = 'neup.account'`,
    Prisma.sql`r."name" NOT LIKE ${`${DIRECT_CUSTOM_ROLE_PREFIX}%`}`,
  ];

  if (input.roleIds && input.roleIds.length > 0) {
    filters.push(Prisma.sql`r."id" IN (${Prisma.join(input.roleIds)})`);
  }

  if (input.allowedRoleIds) {
    const allowedIds = Array.from(input.allowedRoleIds);
    if (allowedIds.length === 0) {
      return [];
    }
    filters.push(Prisma.sql`r."id" IN (${Prisma.join(allowedIds)})`);
  }

  const rows = await prisma.$queryRaw<RawDirectAssignableRoleRow[]>(Prisma.sql`
    SELECT
      r."id",
      r."name",
      r."description",
      r."scope_for"::text AS "scopeForText",
      r."scope_level"::text AS "scopeLevelText",
      r."permissions"::text AS "permissionsText"
    FROM "authz_role" r
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY r."name" ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scopeFor: parseStoredJsonText(row.scopeForText),
    scopeLevel: parseStoredJsonText(row.scopeLevelText),
    permissions: parseStoredJsonText(row.permissionsText),
  }));
}

async function loadDirectAccessAssignableRolesWithMalformedJsonFallback(input: {
  allowedRoleIds: Set<string> | null;
}): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  scopeFor: Prisma.JsonValue | null;
  scopeLevel: Prisma.JsonValue | null;
  permissions: Prisma.JsonValue | null;
}>> {
  return loadAuthzRolesWithMalformedJsonFallback({
    allowedRoleIds: input.allowedRoleIds,
  });
}

export async function getDirectAccessAssignmentOptions(selectedAccountId?: string | null): Promise<{
  roles: DirectAccessAssignableRole[];
}> {
  const accessContext = await resolveAccessProfileContext({
    selectedProfile: selectedAccountId,
    requiredPermissions: ACCESS_TEAM_ADD_PERMISSIONS,
  });
  if (!accessContext) return { roles: [] };

  const accountId = accessContext.selectedProfile;

  try {
    const allowedRoleIds = await getSelfManagedDirectRoleIds();
    if (allowedRoleIds && allowedRoleIds.size === 0) {
      return { roles: [] };
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { accountType: true },
    });
    if (!account) return { roles: [] };

    const roles = await (async () => {
      try {
        return await prisma.authzRole.findMany({
          where: {
            appId: 'neup.account',
            name: { not: { startsWith: DIRECT_CUSTOM_ROLE_PREFIX } },
            ...(allowedRoleIds ? { id: { in: Array.from(allowedRoleIds) } } : {}),
          },
          select: { id: true, name: true, description: true, scopeFor: true, scopeLevel: true, permissions: true },
          orderBy: [{ name: 'asc' }],
        });
      } catch (error) {
        if (!isInvalidStoredJsonReadError(error)) throw error;
        return loadDirectAccessAssignableRolesWithMalformedJsonFallback({
          allowedRoleIds,
        });
      }
    })();

    const roleMapPermissions = await rolePermissionNames(roles.map((role) => role.id));
    const assignableRoles = [];
    for (const role of roles) {
      if (!roleMatchesAssignmentModesPolicy({
        accountType: account.accountType,
        scopeFor: role.scopeFor,
        scopeLevel: role.scopeLevel,
        modes: ['manageable'],
      })) {
        continue;
      }
      if (!roleMatchesAccountTypeScopePolicy({
        accountType: account.accountType,
        scopeFor: role.scopeFor,
        scopeLevel: role.scopeLevel,
        requiredScopeLevel: 'managable',
      })) {
        continue;
      }

      const permissionNames = Array.from(new Set([
        ...extractRolePermissionNames(role.permissions),
        ...(roleMapPermissions.get(role.id) ?? []),
      ]));
      if (!hasAllContextPermissions(accessContext.permissions, permissionNames)) {
        continue;
      }

      assignableRoles.push(role);
    }

    return {
      roles: assignableRoles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description ?? undefined,
      })),
    };
  } catch (error) {
    await logError('database', error, 'getDirectAccessAssignmentOptions');
    return { roles: [] };
  }
}

/**
 * ::neup.documentation::update-direct-member-access
 * ::title Update Direct Member Access
 *
 * Replaces the direct-account role grants held by one invited or active member on the currently selected profile.
 *
 * ::public
 *
 * The action validates the selected roles against account type and caller permissions before replacing all direct grants for the member.
 *
 * ::public end
 *
 * ::private
 *
 * The action uses `scope_for` and `scope_level` to validate whether a role can be assigned to the selected account type.
 *
 * ::private end
 *
 * ::end
 */
export async function updateDirectMemberAccess(input: {
  memberAccountId: string;
  roleIds: string[];
  selectedAccountId?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const accessContext = await resolveAccessProfileContext({
    selectedProfile: input.selectedAccountId,
    requiredPermissions: ACCESS_TEAM_ADD_PERMISSIONS,
  });
  if (!accessContext) return { success: false, error: 'Permission denied.' };

  const accountId = accessContext.selectedProfile;

  const roleIds = normalizeStringList(input.roleIds);

  if (!input.memberAccountId) {
    return { success: false, error: 'Missing member account.' };
  }

  if (input.memberAccountId === accountId) {
    return { success: false, error: 'Direct account roles cannot be edited from this member page.' };
  }

  try {
    const allowedRoleIds = await getSelfManagedDirectRoleIds();
    if (allowedRoleIds) {
      const disallowedRoleIds = roleIds.filter((roleId) => !allowedRoleIds.has(roleId));
      if (disallowedRoleIds.length > 0) {
        return { success: false, error: 'One or more roles are not available for your self account.' };
      }
    }

    const [targetMember, activeMembership, selectedRoles, parentAccount] = await Promise.all([
      prisma.account.findUnique({
        where: { id: input.memberAccountId },
        select: { id: true, accountType: true },
      }),
      prisma.member.findFirst({
        where: {
          memberType: 'acc_in_acc',
          memberAccountId: input.memberAccountId,
          parentAccountId: accountId,
          status: 'active',
        },
        select: { id: true },
      }),
      roleIds.length > 0
        ? loadAuthzRolesWithMalformedJsonFallback({
            roleIds,
          })
        : Promise.resolve([]),
      prisma.account.findUnique({
        where: { id: accountId },
        select: { accountType: true },
      }),
    ]);

    if (!targetMember) return { success: false, error: 'Member account not found.' };
    if (targetMember.accountType !== 'individual') {
      return { success: false, error: 'Only individual accounts can be team members.' };
    }
    if (!activeMembership) {
      return { success: false, error: 'The invitation must be accepted before roles can be assigned.' };
    }
    if (!parentAccount) return { success: false, error: 'Selected account not found.' };
    if (selectedRoles.length !== roleIds.length) return { success: false, error: 'One or more roles are invalid.' };
    if (selectedRoles.some((role) => !roleMatchesAssignmentModesPolicy({
      accountType: parentAccount.accountType,
      scopeFor: role.scopeFor,
      scopeLevel: role.scopeLevel,
      modes: ['manageable'],
    }))) {
      return { success: false, error: 'One or more roles cannot be assigned for this account type.' };
    }
    if (selectedRoles.some((role) => !roleMatchesAccountTypeScopePolicy({
      accountType: parentAccount.accountType,
      scopeFor: role.scopeFor,
      scopeLevel: role.scopeLevel,
      requiredScopeLevel: 'managable',
    }))) {
      return { success: false, error: 'One or more roles do not match the required scope_for and scope_level for this account type.' };
    }

    const currentPermissionSet = new Set(accessContext.permissions);
    const requestedPermissionNames = new Set<string>();
    const roleMapPermissions = await rolePermissionNames(roleIds);
    for (const role of selectedRoles) {
      for (const permissionName of extractRolePermissionNames(role.permissions)) {
        requestedPermissionNames.add(permissionName);
      }
      for (const permissionName of roleMapPermissions.get(role.id) ?? []) {
        requestedPermissionNames.add(permissionName);
      }
    }

    const disallowed = Array.from(requestedPermissionNames).filter((permissionName) => {
      const candidates = new Set([
        ...resolveNeupAccountPermissionCandidates(permissionName, 'managed'),
        ...resolveNeupAccountPermissionCandidates(permissionName, 'selfOrRoot'),
      ]);
      return !Array.from(candidates).some((candidate) => currentPermissionSet.has(candidate));
    });
    if (disallowed.length > 0) {
      return { success: false, error: `You cannot grant permissions you do not hold: ${disallowed.join(', ')}` };
    }

    await prisma.$transaction(async (tx) => {
      const customAccessRows = await tx.access.findMany({
        where: {
          parentAccountId: accountId,
          memberAccountId: input.memberAccountId,
          role: {
            name: { startsWith: DIRECT_CUSTOM_ROLE_PREFIX },
          },
        },
        select: { roleId: true },
      });
      const customRoleIds = Array.from(new Set(customAccessRows.map((row) => row.roleId)));

      await tx.access.deleteMany({
        where: {
          parentAccountId: accountId,
          memberAccountId: input.memberAccountId,
        },
      });

      if (customRoleIds.length > 0) {
        await tx.authzRolePermissionMap.deleteMany({
          where: { roleId: { in: customRoleIds } },
        });
        await tx.authzRole.deleteMany({
          where: {
            id: { in: customRoleIds },
            accessRows: { none: {} },
          },
        });
      }

      for (const roleId of roleIds) {
        await ensureAccessGrant(tx, {
          memberAccountId: input.memberAccountId,
          parentAccountId: accountId,
          childAccountId: accountId,
          accessApplicationId: 'neup.account',
          roleId,
        });
      }

      if (roleIds.length > 0) {
        const pendingRequests = await tx.request.findMany({
          where: {
            action: 'access_invitation',
            senderId: accountId,
            recipientId: input.memberAccountId,
            status: 'pending',
          },
          select: { id: true, data: true },
        });
        const directRequestIds = pendingRequests
          .filter((request) => !(request.data as Record<string, unknown> | null)?.parentPortfolioId)
          .map((request) => request.id);

        if (directRequestIds.length > 0) {
          await tx.request.deleteMany({
            where: { id: { in: directRequestIds } },
          });
        }
      }
    });

    await logActivity(
      accountId,
      `Updated direct access roles for ${input.memberAccountId}: [${roleIds.join(', ')}]`,
      'Success',
    );

    revalidatePath('/access');
    revalidatePath('/access/team');
    revalidatePath(`/access/assign?account=${input.memberAccountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateDirectMemberAccess:${accountId}:${input.memberAccountId}`);
    return { success: false, error: 'Failed to update direct access.' };
  }
}

/**
 * Removes all direct (non-portfolio) access grants a member holds on the
 * active account, then revalidates the access pages.
 *
 * Security rules:
 * - The account owner's own grants cannot be removed by a delegated actor.
 *   Only the owner themselves (personalAccountId === accessTo) can
 *   remove their own access. A member who was granted access later cannot
 *   remove the grants of the account that originally owns the resource.
 */
export async function removeDirectMember(
  memberAccountId: string,
  selectedAccountId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const accessContext = await resolveAccessProfileContext({
    selectedProfile: selectedAccountId,
    requiredPermissions: ACCESS_TEAM_REMOVE_PERMISSIONS,
  });
  if (!accessContext) return { success: false, error: 'Permission denied.' };

  const accessTo = accessContext.selectedProfile;

  // Nobody can remove the account owner's own direct grants:
  // - not a delegated actor (personalAccountId !== accessTo)
  // - not the owner themselves
  if (memberAccountId === accessTo) {
    return { success: false, error: 'Direct account roles cannot be removed.' };
  }

  try {
    await prisma.member.deleteMany({
      where: {
        memberType: 'acc_in_acc',
        memberAccountId,
        parentAccountId: accessTo,
      },
    });
    await prisma.access.deleteMany({
      where: {
        memberAccountId,
        parentAccountId: accessTo,
      },
    });

    await logActivity(accessTo, `Removed all direct access for ${memberAccountId}`, 'Success');
    revalidatePath('/access');
    revalidatePath('/access/team');
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeDirectMember:${memberAccountId}`);
    return { success: false, error: 'Failed to remove access.' };
  }
}

/**
 * Cancels a pending direct (non-portfolio) access invitation sent to a member.
 */
export async function cancelDirectInvitation(
  recipientAccountId: string,
  selectedAccountId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const accessContext = await resolveAccessProfileContext({
    selectedProfile: selectedAccountId,
    requiredPermissions: ACCESS_TEAM_REMOVE_PERMISSIONS,
  });
  if (!accessContext) return { success: false, error: 'Permission denied.' };

  const senderAccountId = accessContext.selectedProfile;

  try {
    const requests = await prisma.request.findMany({
      where: {
        action: 'access_invitation',
        senderId: senderAccountId,
        recipientId: recipientAccountId,
        status: 'pending',
      },
      select: { id: true, data: true },
    });
    const directRequestIds = requests
      .filter((request) => !(request.data as Record<string, unknown> | null)?.parentPortfolioId)
      .map((request) => request.id);
    if (directRequestIds.length > 0) {
      await prisma.$transaction([
        prisma.request.deleteMany({ where: { id: { in: directRequestIds } } }),
        prisma.notification.deleteMany({
          where: {
            OR: directRequestIds.map((requestId) => ({
              detail: { path: ['requestId'], equals: requestId },
            })),
          },
        }),
      ]);
    }

    revalidatePath('/access');
    revalidatePath('/access/team');
    return { success: true };
  } catch (error) {
    await logError('database', error, `cancelDirectInvitation:${recipientAccountId}`);
    return { success: false, error: 'Failed to cancel invitation.' };
  }
}

/**
 * Removes a member from a portfolio by looking up their member row
 * and delegating to removeAssetGroupMember.
 */
export async function removePortfolioMember(
  _parentPortfolioId: string,
  _memberAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Portfolio access has been removed.' };
}

/**
 * Cancels a pending portfolio membership invitation by removing the
 * PortfolioMember row with status 'invited' or 'expired'.
 */
export async function cancelPortfolioInvitation(
  _parentPortfolioId: string,
  _recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Portfolio access has been removed.' };
}

/**
 * Sends a portfolio membership invitation to an account that is not yet a member.
 * Role is null at invite time — flags default to isPermanent: false, hasFullAccess: false.
 */
export async function inviteToPortfolio(
  _parentPortfolioId: string,
  _recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Portfolio access has been removed.' };
}

/**
 * Sends a direct (non-portfolio) access invitation to an account that has no
 * existing grants on the active account. Role is null at invite time.
 */
export async function inviteDirectMember(
  recipientAccountId: string,
  selectedAccountId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const accessContext = await resolveAccessProfileContext({
    selectedProfile: selectedAccountId,
    requiredPermissions: ACCESS_TEAM_ADD_PERMISSIONS,
  });
  if (!accessContext) return { success: false, error: 'Permission denied.' };

  const senderAccountId = accessContext.selectedProfile;

  try {
    // Prevent inviting self
    if (recipientAccountId === senderAccountId) {
      return { success: false, error: 'You cannot invite yourself.' };
    }

    const recipient = await prisma.account.findUnique({
      where: { id: recipientAccountId },
      select: { accountType: true },
    });
    if (!recipient) return { success: false, error: 'Account not found.' };
    if (recipient.accountType !== 'individual') {
      return { success: false, error: 'Only individual accounts can be invited to a team.' };
    }

    // Check for existing grants
    const existingGrant = await prisma.member.findFirst({
      where: {
        memberType: 'acc_in_acc',
        memberAccountId: recipientAccountId,
        parentAccountId: senderAccountId,
      },
      select: { id: true },
    });
    if (existingGrant) {
      return { success: false, error: 'This account already has access.' };
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.request.findFirst({
      where: {
        action: 'access_invitation',
        senderId: senderAccountId,
        recipientId: recipientAccountId,
        status: 'pending',
        data: { path: ['parentPortfolioId'], equals: Prisma.JsonNull },
      },
      select: { id: true, data: true },
    });

    // Fallback: also check without parentPortfolioId filter (direct invitations may not have data)
    const existingInvitationFallback = existingInvitation ?? await prisma.request.findFirst({
      where: {
        action: 'access_invitation',
        senderId: senderAccountId,
        recipientId: recipientAccountId,
        status: 'pending',
      },
      select: { id: true, data: true },
    });

    if (
      existingInvitationFallback &&
      !(existingInvitationFallback.data as Record<string, unknown> | null)?.parentPortfolioId
    ) {
      return { success: false, error: 'An invitation has already been sent to this account.' };
    }

    // Invitation expires 7 days from now
    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + 7);

    await prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          action: 'access_invitation',
          senderId: senderAccountId,
          recipientId: recipientAccountId,
          status: 'pending',
          data: {
            parentAccountId: senderAccountId,
            expiresOn: expiresOn.toISOString(),
          },
        },
      });

      await tx.notification.create({
        data: {
          accountId: recipientAccountId,
          action: 'access_invitation',
          title: 'Access Invitation',
          message: 'You have received an access invitation.',
          type: 'info',
          read: false,
          deletableOn: expiresOn,
          detail: {
            requestId: request.id,
          },
        },
      });
    });

    revalidatePath('/access');
    revalidatePath('/access/team');
    revalidatePath(`/access/assign?account=${recipientAccountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `inviteDirectMember:${recipientAccountId}`);
    return { success: false, error: 'Failed to send invitation.' };
  }
}

async function resolvePortfolioAssetRow(assetRef: string): Promise<{
  rowId: string;
  assetId: string;
  assetType: string;
} | null> {
  const toLogicalAssetId = (row: {
    id: string;
    member_account_id: string | null;
    access_application_id: string | null;
    member_connection_id: string | null;
  }): string => row.member_account_id ?? row.access_application_id ?? row.member_connection_id ?? row.id;

  const byRow = await prisma.asset.findUnique({
    where: { id: assetRef },
    select: {
      id: true,
      access_type: true,
      member_account_id: true,
      access_application_id: true,
      member_connection_id: true,
    },
  });
  if (byRow) {
    return {
      rowId: byRow.id,
      assetId: toLogicalAssetId(byRow),
      assetType: byRow.access_type,
    };
  }

  const byLogical = await prisma.asset.findFirst({
    where: {
      OR: [
        { member_account_id: assetRef },
        { access_application_id: assetRef },
        { member_connection_id: assetRef },
      ],
    },
    select: {
      id: true,
      access_type: true,
      member_account_id: true,
      access_application_id: true,
      member_connection_id: true,
    },
    orderBy: { id: 'asc' },
  });
  if (!byLogical) return null;
  return {
    rowId: byLogical.id,
    assetId: toLogicalAssetId(byLogical),
    assetType: byLogical.access_type,
  };
}

export async function assignOrInviteAssetMember(input: {
  assetRef: string;
  memberId: string;
  roleId?: string;
  rootMode?: boolean;
}): Promise<{ success: boolean; error?: string; mode?: 'assigned' | 'invited' }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  if (!input.assetRef || !input.memberId) {
    return { success: false, error: 'Missing required fields.' };
  }

  if (input.memberId === senderAccountId) {
    return { success: false, error: 'You cannot assign/invite yourself.' };
  }

  try {
    const asset = await resolvePortfolioAssetRow(input.assetRef);
    if (!asset) return { success: false, error: 'Asset not found.' };

    if (input.rootMode) {
      const rootAllowed = await isRootUser(senderAccountId);
      if (!rootAllowed) return { success: false, error: 'Root mode is not allowed.' };

      const roles = await getRolesForAsset(asset.rowId);
      if (roles.length === 0) {
        return { success: false, error: 'No roles are available for this asset type.' };
      }
      if (!input.roleId) {
        return { success: false, error: 'Please select a role before assigning access.' };
      }
      const selectedRole = roles.find((role) => role.id === input.roleId);
      if (!selectedRole) {
        return { success: false, error: 'Selected role is not valid for this asset.' };
      }

      const result = await assignAssetMemberRole({
        assetMember: input.memberId,
        asset: asset.rowId,
        role: selectedRole.id,
      }, { rootMode: true });

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to assign asset access.' };
      }

      revalidatePath('/access');
      revalidatePath(`/access/team?asset=${encodeURIComponent(asset.assetId)}&mode=root`);
      revalidatePath(`/access/asset?asset=${encodeURIComponent(asset.assetId)}&mode=root`);
      return { success: true, mode: 'assigned' };
    }

    const existingInvitation = await prisma.request.findFirst({
      where: {
        action: 'asset_access_invitation',
        senderId: senderAccountId,
        recipientId: input.memberId,
        status: 'pending',
        data: {
          path: ['assetId'],
          equals: asset.assetId,
        },
      },
      select: { id: true },
    });
    if (existingInvitation) {
      return { success: false, error: 'An invitation has already been sent for this asset.' };
    }

    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + 7);

    await prisma.request.create({
      data: {
        action: 'asset_access_invitation',
        senderId: senderAccountId,
        recipientId: input.memberId,
        status: 'pending',
        data: {
          assetId: asset.assetId,
          assetType: asset.assetType,
          expiresOn: expiresOn.toISOString(),
        },
      },
    });

    revalidatePath('/access');
      revalidatePath(`/access/team?asset=${encodeURIComponent(asset.assetId)}`);
    revalidatePath(`/access/asset?asset=${encodeURIComponent(asset.assetId)}`);
    return { success: true, mode: 'invited' };
  } catch (error) {
    await logError('database', error, `assignOrInviteAssetMember:${input.assetRef}:${input.memberId}`);
    return { success: false, error: 'Failed to process asset member action.' };
  }
}

export async function getAssignableRolesForAsset(assetRef: string): Promise<{
  success: boolean;
  roles?: Array<{ id: string; name: string; description?: string }>;
  error?: string;
}> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not authenticated.' };

  try {
    const asset = await resolvePortfolioAssetRow(assetRef);
    if (!asset) return { success: false, error: 'Asset not found.' };

    const roles = await getRolesForAsset(asset.rowId);
    return { success: true, roles };
  } catch (error) {
    await logError('database', error, `getAssignableRolesForAsset:${assetRef}`);
    return { success: false, error: 'Failed to load asset roles.' };
  }
}
