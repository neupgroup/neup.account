"use server";

// Server-side user data layer. Fetches profile, contacts, NeupIDs, and permissions
// for a given account. All functions fall back to the active account if no ID is passed.

import prisma from "@/core/helpers/prisma";
import { Prisma } from "@/prisma/generated/client/client";
import { logError } from "@/core/helpers/logger";
import { getActiveAccountId, getPersonalAccountId } from "@/core/auth/verify";
import { extractGenderFromDetails, resolveDisplayImage } from "@/core/helpers/display-image";
import { getAccountSelectorContext } from "@/core/auth/accountSelector";
import { cleanupExpiredAccessModel, extractRolePermissionNames } from "@/services/access-model";
import { isRootRoleScope, normalizeRoleScope, normalizeRoleScopes } from '@/services/role-scopes';
import {
  deriveLegacyRoleScopesFromPolicy,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';
import {
  getCanonicalPermissionAudience,
  resolveNeupAccountPermissionCandidates,
  stripPermissionAudience,
} from '@/services/neup-account/permission-catalog';

/**
 * ::neup.documentation::user-service-module
 * ::title User Data And Permission Service
 *
 * Central user-data layer for profile fields, contact data, NeupIDs, and permission resolution.
 *
 * ::public
 *
 * This module powers profile reads, selected-account permission checks, root-role lookups, and app-specific access resolution across the account app.
 *
 * ::public end
 *
 * ::private
 *
 * Permission reads are based on the `access` model plus authz role records, with compatibility helpers to preserve legacy permission expectations.
 *
 * ::private end
 *
 * ::end
 */
// --- Types ---

export type UserProfile = {
  brandName?: string;
  nameFirst?: string;
  nameMiddle?: string;
  nameLast?: string;
  nameDisplay?: string;
  displayName?: string;
  accountPhoto?: string;
  gender?: string; // 'male', 'female', 'prefer_not_to_say', 'c.custom'
  dateBirth?: string; // ISO string
  dateCreated?: string; // ISO string
  nationality?: string;
  isLegalEntity?: boolean;
  nameLegal?: string;
  registrationId?: string;
  countryOfOrigin?: string;
  dateEstablished?: string; // ISO string
  headOfficeLocation?: string;
  neupIdPrimary?: string;
  verified?: boolean;
  accountType?: string;
  permit?: string;
  pro?: boolean;
};

export type UserContacts = {
  primaryPhone?: string;
  secondaryPhone?: string;
  permanentLocation?: string;
  currentLocation?: string;
  workLocation?: string;
  otherLocation?: string;
};

export type HomeSelectedAccountAccessLog = {
  personalAccountId: string;
  activeAccountId: string;
  isManaging: boolean;
  grants: Array<{
    accessId: string;
    accessType: string;
    status: string;
    roleId: string;
    roleName: string | null;
    roleScope: string[] | null;
    permissions: string[];
    expiresAt: string | null;
  }>;
};

type PermissionGrantEntry = {
  name: string;
  roleScope: string[] | null;
};

export type AccountRolePermissionsEntry = [roleId: string, roleName: string | null, permissionNames: string[]];

type PermissionMatchContext = 'managed' | 'root' | 'self' | 'selfOrRoot';

function shouldIgnoreManagedRoleScope(scope: unknown): boolean {
  return isRootRoleScope(scope);
}

function matchesRoleScope(
  roleScope: unknown,
  expectedRoleScopes?: readonly string[] | string,
): boolean {
  if (!expectedRoleScopes) return true;

  const allowedScopes = Array.isArray(expectedRoleScopes)
    ? expectedRoleScopes
    : [expectedRoleScopes];

  const normalizedRoleScope = normalizeRoleScope(roleScope);
  if (!normalizedRoleScope) return false;

  return allowedScopes
    .map((scope) => normalizeRoleScope(scope) ?? scope.trim())
    .includes(normalizedRoleScope);
}

function permissionMatches(
  grantedPermission: string,
  requiredPermission: string,
  context: PermissionMatchContext,
): boolean {
  const requiredAudience = getCanonicalPermissionAudience(requiredPermission);
  const contextualRequiredPermission =
    context === 'managed' && requiredAudience === 'self'
      ? stripPermissionAudience(requiredPermission)
      : requiredPermission;

  return resolveNeupAccountPermissionCandidates(contextualRequiredPermission, context).includes(grantedPermission);
}

function roleScopeToPermissionContext(
  roleScope?: readonly string[] | string,
): PermissionMatchContext {
  if (!roleScope) return 'selfOrRoot';
  const scopes = Array.isArray(roleScope) ? roleScope : [roleScope];
  return scopes.some((scope) => isRootRoleScope(scope))
    ? 'root'
    : 'self';
}

type AppAccessGrantQuery = {
  memberAccountId: string;
  appId: string;
  accessType?: 'acc_self' | 'acc_self_root';
  parentAccountId?: string;
};

type RawAccessRoleRow = {
  accessId: string;
  accessType: string;
  status: string;
  roleId: string;
  roleName: string | null;
  roleScopeForText: string | null;
  roleScopeLevel: string | null;
  rolePermissions: Prisma.JsonValue | null;
  expiresAt: Date | null;
};

async function queryAccessRoleRows(input: {
  memberAccountId: string;
  appId: string;
  accessType?: 'acc_self' | 'acc_self_root';
  parentAccountId?: string;
}): Promise<RawAccessRoleRow[]> {
  const rows = await prisma.$queryRaw<RawAccessRoleRow[]>(Prisma.sql`
    SELECT
      a."id" AS "accessId",
      a."access_type" AS "accessType",
      a."status" AS "status",
      a."role_id" AS "roleId",
      r."name" AS "roleName",
      r."scope_for"::text AS "roleScopeForText",
      r."scope_level" AS "roleScopeLevel",
      r."permissions" AS "rolePermissions",
      a."is_temporary" AS "expiresAt"
    FROM "access" a
    INNER JOIN "authz_role" r ON r."id" = a."role_id"
    WHERE a."member_account_id" = ${input.memberAccountId}
      AND a."access_application_id" = ${input.appId}
      AND a."status" = 'active'
      AND (a."is_temporary" IS NULL OR a."is_temporary" > NOW())
      AND r."app_id" = ${input.appId}
      ${input.accessType ? Prisma.sql`AND a."access_type" = ${input.accessType}` : Prisma.empty}
      ${input.parentAccountId ? Prisma.sql`AND a."parent_account_id" = ${input.parentAccountId}` : Prisma.empty}
    ORDER BY a."role_id" ASC, a."id" ASC
  `);

  return rows;
}

function getRoleScopeFromAccessRow(row: RawAccessRoleRow): string[] {
  return deriveLegacyRoleScopesFromPolicy(
    normalizeAuthzScopeFor(row.roleScopeForText),
    normalizeSingleAuthzScopeLevel(row.roleScopeLevel),
  );
}

async function getAppAccessRoleRows({
  memberAccountId,
  appId,
  accessType,
  parentAccountId,
}: AppAccessGrantQuery): Promise<Array<{ roleId: string; roleName: string | null; roleScope: string[] | null; permissionNames: string[] }>> {
  if (!memberAccountId || !appId) return [];

  try {
    await cleanupExpiredAccessModel();
    const accessRows = await queryAccessRoleRows({
      memberAccountId,
      appId,
      accessType,
      parentAccountId,
    });

    return accessRows.map((row) => ({
      roleId: row.roleId,
      roleName: row.roleName,
      roleScope: getRoleScopeFromAccessRow(row),
      permissionNames: extractRolePermissionNames(row.rolePermissions),
    }));
  } catch (error) {
    const scopeLabel = accessType ?? 'all';
    const parentLabel = parentAccountId ?? 'self';
    await logError(
      'database',
      error,
      `getAppAccessRoleRows:${memberAccountId}:${appId}:${scopeLabel}:${parentLabel}`,
    );
    return [];
  }
}

function flattenPermissionNames(
  rows: Array<{ roleScope: string[] | null; permissionNames: string[] }>,
  options?: { ignoreManagedRootScope?: boolean },
): string[] {
  const permissions = rows.flatMap((row) =>
    options?.ignoreManagedRootScope && shouldIgnoreManagedRoleScope(row.roleScope)
      ? []
      : row.permissionNames
  );

  return Array.from(new Set(permissions));
}

function toRolePermissionEntries(
  rows: Array<{ roleId: string; roleName: string | null; roleScope: string[] | null; permissionNames: string[] }>,
  options?: { ignoreManagedRootScope?: boolean },
): AccountRolePermissionsEntry[] {
  const grouped = new Map<string, AccountRolePermissionsEntry>();

  for (const row of rows) {
    if (options?.ignoreManagedRootScope && shouldIgnoreManagedRoleScope(row.roleScope)) {
      continue;
    }

    const existing = grouped.get(row.roleId);
    if (existing) {
      existing[2] = Array.from(new Set([...existing[2], ...row.permissionNames]));
      continue;
    }

    grouped.set(row.roleId, [
      row.roleId,
      row.roleName,
      Array.from(new Set(row.permissionNames)),
    ]);
  }

  return Array.from(grouped.values());
}

// --- User Data Fetching ---

// Fetches the full profile for an account, including individual and brand sub-profiles.
// nameDisplay prefers the brand name if present, then falls back to account.displayName.
export async function getUserProfile(
  accountId?: string,
): Promise<UserProfile | null> {
  /**
   * ::neup.documentation::user-service-get-user-profile
   * ::function getUserProfile(accountId)
   *
   * Returns the normalized profile payload for one account.
   *
   * ::public
   *
   * The payload merges account, individual-profile, brand-profile, contact, and primary-NeupID fields into one server-friendly structure.
   *
   * ::public end
   *
   * ::private
   *
   * When no account ID is supplied, the helper falls back to the active selected account.
   *
   * ::private end
   *
   * ::end
   */
  const idToFetch = accountId || (await getActiveAccountId());
  if (!idToFetch) return null;
  try {
    const account = await prisma.account.findUnique({
      where: { id: idToFetch },
      include: {
        individualProfile: true,
        brandProfile: true,
        contacts: {
          where: {
            contactType: 'headOfficeLocation',
          },
          select: {
            value: true,
          },
          take: 1,
        },
        neupIds: {
          where: { isPrimary: true },
          select: { neupId: true },
          take: 1,
        },
      },
    });

    if (account) {
      const brandDetails =
        account.brandProfile?.details && typeof account.brandProfile.details === 'object'
          ? (account.brandProfile.details as Record<string, unknown>)
          : {};

      const serializedData: UserProfile = {
        brandName: account.brandProfile?.brandName || undefined,
        nameFirst: account.individualProfile?.firstName || undefined,
        nameMiddle: account.individualProfile?.middleName || undefined,
        nameLast: account.individualProfile?.lastName || undefined,
        nameDisplay:
          account.displayName || account.brandProfile?.brandName || undefined,
        displayName: account.displayName || undefined,
        accountPhoto: account.displayImage || undefined,
        dateBirth:
          account.individualProfile?.dateOfBirth?.toISOString() || undefined,
        dateCreated: account.createdAt?.toISOString() || undefined,
        nationality: account.individualProfile?.countryOfResidence || undefined,
        isLegalEntity: account.brandProfile?.isLegalEntity || undefined,
        nameLegal:
          typeof brandDetails.nameLegal === 'string' ? brandDetails.nameLegal : undefined,
        registrationId:
          typeof brandDetails.registrationId === 'string' ? brandDetails.registrationId : undefined,
        countryOfOrigin: account.brandProfile?.originCountry || undefined,
        dateEstablished:
          typeof brandDetails.dateEstablished === 'string'
            ? brandDetails.dateEstablished
            : account.brandProfile
              ? account.createdAt.toISOString()
              : undefined,
        headOfficeLocation: account.contacts[0]?.value || undefined,
        verified: account.isVerified || undefined,
        accountType: account.accountType || undefined,
        permit: "default",
        pro: false,
        neupIdPrimary: account.neupIds[0]?.neupId || undefined,
      };

      const gender = extractGenderFromDetails({
        accountDetails: account.details,
        individualDetails: account.individualProfile?.details,
      });
      serializedData.gender = gender || undefined;
      serializedData.accountPhoto = resolveDisplayImage({
        displayImage: serializedData.accountPhoto,
        accountType: account.accountType,
        gender,
      });

      serializedData.accountType = account.accountType || "individual";

      return serializedData;
    }
    return null;
  } catch (error) {
    await logError("database", error, `getUserProfile: ${idToFetch}`);
    return null;
  }
}

// Returns just the accountType string for an account.
export async function getAccountType(
  accountId?: string,
): Promise<string | null> {
  const profile = await getUserProfile(accountId);
  return profile?.accountType || null;
}

// Fetches all contact entries for an account, keyed by contactType.
export async function getUserContacts(
  accountId?: string,
): Promise<UserContacts> {
  const idToFetch = accountId || (await getActiveAccountId());
  if (!idToFetch) return {};
  try {
    const contactsList = await prisma.contact.findMany({
      where: { accountId: idToFetch },
    });

    const contacts: UserContacts = {};
    contactsList.forEach((data) => {
      if (data.contactType) {
        contacts[data.contactType as keyof UserContacts] = data.value;
      }
    });
    return contacts;
  } catch (error) {
    await logError("database", error, `getUserContacts: ${idToFetch}`);
    return {};
  }
}

// Returns all NeupID strings associated with an account.
export async function getUserNeupIds(accountId?: string): Promise<string[]> {
  const idToFetch = accountId || (await getActiveAccountId());
  if (!idToFetch) return [];
  try {
    const neupIds = await prisma.neupId.findMany({
      where: { accountId: idToFetch },
    });
    return neupIds.map((doc) => doc.id);
  } catch (error) {
    await logError("database", error, `getUserNeupIds: ${idToFetch}`);
    return [];
  }
}

// Returns NeupID strings with their isPrimary flag.
export async function getUserNeupIdDetails(
  accountId?: string,
): Promise<{ id: string; isPrimary: boolean }[]> {
  const idToFetch = accountId || (await getActiveAccountId());
  if (!idToFetch) return [];
  try {
    const neupIds = await prisma.neupId.findMany({
      where: { accountId: idToFetch },
      select: { id: true, isPrimary: true },
    });
    return neupIds;
  } catch (error) {
    await logError("database", error, `getUserNeupIdDetails: ${idToFetch}`);
    return [];
  }
}

// --- Permissions ---

// Resolves account permissions by active access rows and their role catalog.
export async function getAccountPermission(
  accountId?: string,
): Promise<string[]> {
  /**
   * ::neup.documentation::user-service-get-account-permission
   * ::function getAccountPermission(accountId)
   *
   * Returns the effective Neup Account permission IDs for one account.
   *
   * ::public
   *
   * The permission set is assembled from active, non-expired access rows whose roles belong to the `neup.account` app.
   *
   * ::public end
   *
   * ::private
   *
   * When no account ID is supplied, the helper falls back to the active selected account.
   *
   * ::private end
   *
   * ::end
   */
  const activeId = accountId || (await getActiveAccountId());
  if (!activeId) return [];

  try {
    await cleanupExpiredAccessModel();

    const accessRows = await prisma.access.findMany({
      where: {
        memberAccountId: activeId,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId: 'neup.account',
        },
      },
      select: {
        role: {
          select: {
            permissions: true,
          },
        },
      },
    });

    const permissions = accessRows.flatMap((row) => extractRolePermissionNames(row.role.permissions));

    return Array.from(new Set(permissions));
  } catch (error) {
    await logError(
      "database",
      error,
      `getAccountPermission — grant/permission query failed for ${activeId}`,
    );
    return [];
  }
}

async function getAccountPermissionEntries(
  accountId: string,
): Promise<PermissionGrantEntry[]> {
  try {
    await cleanupExpiredAccessModel();
    const accessRows = await queryAccessRoleRows({
      memberAccountId: accountId,
      appId: 'neup.account',
    });

    return accessRows.flatMap((row) =>
      extractRolePermissionNames(row.rolePermissions).map((name) => ({
        name,
        roleScope: getRoleScopeFromAccessRow(row),
      }))
    );
  } catch (error) {
    await logError(
      'database',
      error,
      `getAccountPermissionEntries — grant/permission query failed for ${accountId}`,
    );
    return [];
  }
}

// Resolves permissions granted by a personal/member account to a selected/managed account.
// This is used when the personal account is viewing or managing another account in context.
export async function getGrantedAccountPermission(
  memberAccountId: string,
  parentAccountId: string,
): Promise<string[]> {
  /**
   * ::neup.documentation::user-service-get-granted-account-permission
   * ::function getGrantedAccountPermission(memberAccountId, parentAccountId)
   *
   * Returns the permissions a member account holds on a managed parent account.
   *
   * ::public
   *
   * Use this helper for delegated-account contexts where the requester is acting on another account they manage.
   *
   * ::public end
   *
   * ::private
   *
   * Root-scoped managed grants are filtered out here so the result reflects delegated managed permissions only.
   *
   * ::private end
   *
   * ::end
   */
  if (!memberAccountId || !parentAccountId) return [];

  try {
    await cleanupExpiredAccessModel();
    const accessRows = await queryAccessRoleRows({
      memberAccountId,
      parentAccountId,
      appId: 'neup.account',
    });

    const permissions = accessRows.flatMap((row) =>
      shouldIgnoreManagedRoleScope(getRoleScopeFromAccessRow(row))
        ? []
        : extractRolePermissionNames(row.rolePermissions)
    );

    return Array.from(new Set(permissions));
  } catch (error) {
    await logError(
      "database",
      error,
      `getGrantedAccountPermission — grant/permission query failed for ${memberAccountId}:${parentAccountId}`,
    );
    return [];
  }
}

export async function getAccountsPermission(
  accountId: string,
  appId: string,
): Promise<string[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: accountId,
    appId,
    accessType: 'acc_self',
  });

  return flattenPermissionNames(rows);
}

export async function getAccountsRole(
  accountId: string,
  appId: string,
): Promise<AccountRolePermissionsEntry[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: accountId,
    appId,
    accessType: 'acc_self',
  });

  return toRolePermissionEntries(rows);
}

export async function getManagedAccountPermissions(
  managedAccountId: string,
  managerAccountId: string,
  appId: string,
): Promise<string[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: managerAccountId,
    parentAccountId: managedAccountId,
    appId,
  });

  return flattenPermissionNames(rows, { ignoreManagedRootScope: true });
}

export async function getManagedAccountRoles(
  managedAccountId: string,
  managerAccountId: string,
  appId: string,
): Promise<AccountRolePermissionsEntry[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: managerAccountId,
    parentAccountId: managedAccountId,
    appId,
  });

  return toRolePermissionEntries(rows, { ignoreManagedRootScope: true });
}

export async function getRootPermissions(
  accountId: string,
  appId: string,
): Promise<string[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: accountId,
    appId,
    accessType: 'acc_self_root',
  });

  return flattenPermissionNames(rows);
}

export async function getRootRoles(
  accountId: string,
  appId: string,
): Promise<AccountRolePermissionsEntry[]> {
  const rows = await getAppAccessRoleRows({
    memberAccountId: accountId,
    appId,
    accessType: 'acc_self_root',
  });

  return toRolePermissionEntries(rows);
}

async function getGrantedAccountPermissionEntries(
  memberAccountId: string,
  parentAccountId: string,
): Promise<PermissionGrantEntry[]> {
  if (!memberAccountId || !parentAccountId) return [];

  try {
    await cleanupExpiredAccessModel();
    const accessRows = await queryAccessRoleRows({
      memberAccountId,
      parentAccountId,
      appId: 'neup.account',
    });

    return accessRows.flatMap((row) => {
      const roleScope = getRoleScopeFromAccessRow(row);
      if (shouldIgnoreManagedRoleScope(roleScope)) {
        return [];
      }

      return extractRolePermissionNames(row.rolePermissions).map((name) => ({
        name,
        roleScope,
      }));
    });
  } catch (error) {
    await logError(
      'database',
      error,
      `getGrantedAccountPermissionEntries — grant/permission query failed for ${memberAccountId}:${parentAccountId}`,
    );
    return [];
  }
}

export async function getCurrentAccountPermission(selectedAccountId?: string | null): Promise<string[]> {
  /**
   * ::neup.documentation::user-service-get-current-account-permission
   * ::function getCurrentAccountPermission(selectedAccountId)
   *
   * Returns the effective permission set for the current account-selector context.
   *
   * ::public
   *
   * The helper automatically switches between direct self permissions and delegated managed-account permissions.
   *
   * ::public end
   *
   * ::private
   *
   * This is the preferred entry point for UI code that should honor the selected-account state.
   *
   * ::private end
   *
   * ::end
   */
  const {
    activeAccountId,
    personalAccountId,
    isManagingOtherAccount,
  } = await getAccountSelectorContext(selectedAccountId);

  if (!activeAccountId || !personalAccountId) {
    return [];
  }

  return isManagingOtherAccount
    ? getGrantedAccountPermission(personalAccountId, activeAccountId)
    : getAccountPermission(activeAccountId);
}

async function getCurrentAccountPermissionEntries(): Promise<PermissionGrantEntry[]> {
  const {
    activeAccountId,
    personalAccountId,
    isManagingOtherAccount,
  } = await getAccountSelectorContext();

  if (!activeAccountId || !personalAccountId) {
    return [];
  }

  return isManagingOtherAccount
    ? getGrantedAccountPermissionEntries(personalAccountId, activeAccountId)
    : getAccountPermissionEntries(activeAccountId);
}

// Returns true when a member account has all required permissions granted on a selected account.
export async function checkGrantedPermissions(
  requiredPermissions: readonly string[],
  memberAccountId: string,
  parentAccountId: string,
): Promise<boolean> {
  /**
   * ::neup.documentation::user-service-check-granted-permissions
   * ::function checkGrantedPermissions(requiredPermissions, memberAccountId, parentAccountId)
   *
   * Checks whether a member account holds all required permissions on a managed target account.
   *
   * ::public
   *
   * This helper is used for delegated-account authorization checks where grants are scoped to a parent account.
   *
   * ::public end
   *
   * ::private
   *
   * Matching uses the managed-permission resolution context, not direct self permission matching.
   *
   * ::private end
   *
   * ::end
   */
  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  const entries = await getGrantedAccountPermissionEntries(memberAccountId, parentAccountId);

  return requiredPermissions.every((requiredPermission) =>
    entries.some((entry) => permissionMatches(entry.name, requiredPermission, 'managed')),
  );
}

// Returns true if the active account has all of the required permissions.
export async function checkPermissions(
  requiredPermissions: readonly string[],
  accountId?: string,
  options?: {
    roleScope?: readonly string[] | string;
  },
): Promise<boolean> {
  /**
   * ::neup.documentation::user-service-check-permissions
   * ::function checkPermissions(requiredPermissions, accountId, options)
   *
   * Checks whether an account or current selector context satisfies all required permissions.
   *
   * ::public
   *
   * Callers may optionally require a specific role scope in addition to the permission IDs.
   *
   * ::public end
   *
   * ::private
   *
   * Without an explicit account ID, permission matching automatically respects whether the current selector context is self or managed.
   *
   * ::private end
   *
   * ::end
   */
  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  if (options?.roleScope) {
    const entries = accountId
      ? await getAccountPermissionEntries(accountId)
      : await getCurrentAccountPermissionEntries();
    const permissionContext = roleScopeToPermissionContext(options.roleScope);

    return requiredPermissions.every((permission) =>
      entries.some(
        (entry) =>
          permissionMatches(entry.name, permission, permissionContext) &&
          matchesRoleScope(entry.roleScope, options.roleScope),
      )
    );
  }

  const userPermissions = accountId
    ? await getAccountPermission(accountId)
    : await getCurrentAccountPermission();
  const permissionContext: PermissionMatchContext = accountId
    ? 'selfOrRoot'
    : (await getAccountSelectorContext()).isManagingOtherAccount
      ? 'managed'
      : 'selfOrRoot';

  return requiredPermissions.every((requiredPermission) =>
    userPermissions.some((grantedPermission) => permissionMatches(grantedPermission, requiredPermission, permissionContext)),
  );
}

export async function getHomeSelectedAccountAccessLog(): Promise<HomeSelectedAccountAccessLog | null> {
  const [personalAccountId, activeAccountId] = await Promise.all([
    getPersonalAccountId(),
    getActiveAccountId(),
  ]);

  if (!personalAccountId || !activeAccountId) {
    return null;
  }

  try {
    await cleanupExpiredAccessModel();
    const grants = await queryAccessRoleRows({
      memberAccountId: personalAccountId,
      parentAccountId: activeAccountId,
      appId: 'neup.account',
    });

    return {
      personalAccountId,
      activeAccountId,
      isManaging: personalAccountId !== activeAccountId,
      grants: grants.map((grant) => ({
        accessId: grant.accessId,
        accessType: grant.accessType,
        status: grant.status,
        roleId: grant.roleId,
        roleName: grant.roleName,
        roleScope: getRoleScopeFromAccessRow(grant),
        permissions: extractRolePermissionNames(grant.rolePermissions),
        expiresAt: grant.expiresAt?.toISOString() ?? null,
      })),
    };
  } catch (error) {
    await logError(
      "database",
      error,
      `getHomeSelectedAccountAccessLog:${personalAccountId}:${activeAccountId}`,
    );
    return {
      personalAccountId,
      activeAccountId,
      isManaging: personalAccountId !== activeAccountId,
      grants: [],
    };
  }
}

// --- Validation ---

// Validates that a NeupID exists, is associated with a valid account,
// and that the account is not blocked, deleted, or a brand/subbrand type.
export async function validateNeupId(
  neupId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!neupId || neupId.length < 3) {
    return { success: false, error: "NeupID must be at least 3 characters." };
  }

  try {
    const neupIdDoc = await prisma.neupId.findUnique({
      where: { id: neupId },
      include: { account: true },
    });

    if (!neupIdDoc) {
      return { success: false, error: "NeupID not found." };
    }

    const account = neupIdDoc.account;

    if (!account) {
      return { success: false, error: "Associated account does not exist." };
    }

    // Brand and subbrand accounts cannot sign in directly
    if (account.accountType === "brand" || account.accountType === "subbrand") {
      return { success: false, error: "Brand accounts can't be signed in." };
    }

    if (account.status === "deletion_requested") {
      return { success: false, error: "pending_deletion" };
    }

    if (account.status === "blocked") {
      const details = account.details as Record<string, any> | null;
      const block = details?.block;
      // Check for permanent block or a time-limited block that hasn't expired
      if (
        block &&
        (block.is_permanent ||
          (block.until && new Date(block.until) > new Date()))
      ) {
        return { success: false, error: "This account has been blocked." };
      }
    }

    return { success: true };
  } catch (e) {
    await logError("database", e, `validateNeupId for ${neupId}`);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// Returns whether a NeupID is available for registration.
export async function checkNeupIdAvailability(
  neupId: string,
): Promise<{ available: boolean }> {
  const lowerNeupId = neupId.toLowerCase();
  if (!lowerNeupId || lowerNeupId.length < 3) {
    return { available: false };
  }
  try {
    const count = await prisma.neupId.count({
      where: { id: lowerNeupId },
    });
    return { available: count === 0 };
  } catch (error) {
    await logError(
      "database",
      error,
      `checkNeupIdAvailability: ${lowerNeupId}`,
    );
    return { available: false };
  }
}

// Returns true if the account has a root-scoped role grant in the database.
export async function isRootUser(accountId: string): Promise<boolean> {
  if (!accountId) return false;
  try {
    await cleanupExpiredAccessModel();

    const count = await prisma.access.count({
      where: {
        memberAccountId: accountId,
        accessType: 'acc_self_root',
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId: 'neup.account',
        },
      },
    });
    return count > 0;
  } catch (error) {
    await logError("database", error, `isRootUser check for ${accountId}`);
    return false;
  }
}
