"use server";

// Server-side user data layer. Fetches profile, contacts, NeupIDs, and permissions
// for a given account. All functions fall back to the active account if no ID is passed.

import prisma from "@/core/helpers/prisma";
import { logError } from "@/core/helpers/logger";
import { getActiveAccountId, getPersonalAccountId } from "@/core/auth/verify";

const DEFAULT_ACCOUNT_AVATAR = "https://neupgroup.com/assets/user.png";

// --- Types ---

export type UserProfile = {
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
        neupIds: {
          where: { isPrimary: true },
          select: { neupId: true },
          take: 1,
        },
      },
    });

    if (account) {
      const serializedData: UserProfile = {
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
        countryOfOrigin: account.brandProfile?.originCountry || undefined,
        verified: account.isVerified || undefined,
        accountType: account.accountType || undefined,
        permit: "default",
        pro: false,
        neupIdPrimary: account.neupIds[0]?.neupId || undefined,
      };

      // Fall back to the default avatar if no photo is set
      if (!serializedData.accountPhoto) {
        serializedData.accountPhoto = DEFAULT_ACCOUNT_AVATAR;
      }

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

// Resolves account permissions by:
// 1) finding role grants in member for active account + app scope,
// 2) loading denormalized permissions from authz_role.permissions for those roleIds.
export async function getAccountPermission(
  accountId?: string,
): Promise<string[]> {
  const activeId = accountId || (await getActiveAccountId());
  if (!activeId) return [];

  try {
    const grants = await prisma.member.findMany({
      where: {
        memberId: activeId,
        accessFor: 'account',
        parentApplicationId: "neup.account",
      },
      select: { roleId: true },
    });

    if (!grants.length) {
      return [];
    }

    const roleIds = Array.from(new Set(grants.map((grant) => grant.roleId)));

    const roles = await prisma.authzRole.findMany({
      where: {
        id: { in: roleIds },
        appId: "neup.account",
      },
      select: {
        permissions: true,
      },
    });

    const permissions = [
      ...new Set(
        roles.flatMap((row) => {
          if (!Array.isArray(row.permissions)) return [];

          return row.permissions.filter(
            (item): item is string => typeof item === "string",
          );
        }),
      ),
    ];

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

// Returns true if the active account has all of the required permissions.
export async function checkPermissions(
  requiredPermissions: string[],
  accountId?: string,
): Promise<boolean> {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  const userPermissions = await getAccountPermission(accountId);
  const permissionsSet = new Set(userPermissions);

  return requiredPermissions.every((p) => permissionsSet.has(p));
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
    const count = await prisma.member.count({
      where: {
        memberId: accountId,
        accessFor: 'account',
        parentApplicationId: 'neup.account',
        role: { scope: 'root' },
      },
    });
    return count > 0;
  } catch (error) {
    await logError("database", error, `isRootUser check for ${accountId}`);
    return false;
  }
}
