"use server";

// Server-side user data layer. Fetches profile, contacts, NeupIDs, and permissions
// for a given account. All functions fall back to the active account if no ID is passed.

import prisma from "@/core/helpers/prisma";
import { logError } from "@/core/helpers/logger";
import { getActiveAccountId, getPersonalAccountId } from "@/core/auth/verify";
import { extractGenderFromDetails, resolveDisplayImage } from "@/core/helpers/display-image";
import { cleanupExpiredAccessModel, extractRolePermissionNames } from "@/services/access-model";

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
    roleScope: string | null;
    permissions: string[];
    expiresAt: string | null;
  }>;
};

// --- User Data Fetching ---

// Fetches the full profile for an account, including individual and brand sub-profiles.
// nameDisplay prefers the brand name if present, then falls back to account.displayName.
export async function getUserProfile(
  accountId?: string,
): Promise<UserProfile | null> {
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
          account.brandProfile?.brandName || account.displayName || undefined,
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

// Resolves permissions granted by a personal/member account to a selected/managed account.
// This is used when the personal account is viewing or managing another account in context.
export async function getGrantedAccountPermission(
  memberAccountId: string,
  parentAccountId: string,
): Promise<string[]> {
  if (!memberAccountId || !parentAccountId) return [];

  try {
    await cleanupExpiredAccessModel();

    const accessRows = await prisma.access.findMany({
      where: {
        memberAccountId,
        parentAccountId,
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
      `getGrantedAccountPermission — grant/permission query failed for ${memberAccountId}:${parentAccountId}`,
    );
    return [];
  }
}

// Returns true when a member account has all required permissions granted on a selected account.
export async function checkGrantedPermissions(
  requiredPermissions: readonly string[],
  memberAccountId: string,
  parentAccountId: string,
): Promise<boolean> {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  const userPermissions = await getGrantedAccountPermission(memberAccountId, parentAccountId);
  const permissionsSet = new Set(userPermissions);

  return requiredPermissions.every((p) => permissionsSet.has(p));
}

// Returns true if the active account has all of the required permissions.
export async function checkPermissions(
  requiredPermissions: readonly string[],
  accountId?: string,
): Promise<boolean> {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  const userPermissions = await getAccountPermission(accountId);
  const permissionsSet = new Set(userPermissions);

  return requiredPermissions.every((p) => permissionsSet.has(p));
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

    const grants = await prisma.access.findMany({
      where: {
        memberAccountId: personalAccountId,
        parentAccountId: activeAccountId,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId: 'neup.account',
        },
      },
      orderBy: {
        roleId: 'asc',
      },
      select: {
        id: true,
        accessType: true,
        status: true,
        roleId: true,
        isTemporary: true,
        role: {
          select: {
            name: true,
            scope: true,
            permissions: true,
          },
        },
      },
    });

    return {
      personalAccountId,
      activeAccountId,
      isManaging: personalAccountId !== activeAccountId,
      grants: grants.map((grant) => ({
        accessId: grant.id,
        accessType: grant.accessType,
        status: grant.status,
        roleId: grant.roleId,
        roleName: grant.role.name ?? null,
        roleScope: grant.role.scope ?? null,
        permissions: extractRolePermissionNames(grant.role.permissions),
        expiresAt: grant.isTemporary?.toISOString() ?? null,
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
// and that the account is not blocked, deleted, or a brand/branch type.
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

    // Brand and branch accounts cannot sign in directly
    if (account.accountType === "brand" || account.accountType === "branch") {
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
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId: 'neup.account',
          scope: 'root',
        },
      },
    });
    return count > 0;
  } catch (error) {
    await logError("database", error, `isRootUser check for ${accountId}`);
    return false;
  }
}
