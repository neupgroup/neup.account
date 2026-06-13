// @ts-nocheck
'use server';

import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { getUserProfile, getUserNeupIds, getAccountType, getAccountPermission, checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logActivity } from '@/services/log-actions';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

function isMissingAssetsGrantTableError(error: unknown): boolean {
  const candidate = error as { code?: string };
  return candidate?.code === 'P2021' || candidate?.code === 'P2022';
}

export type Permission = {
  id: string;
  name: string;
};

export type UserAccess = {
  permitId: string;
  userId: string;
  displayName: string;
  accountPhoto?: string;
  permissions: string[];
  status: 'pending' | 'approved' | 'rejected';
  isSelf: boolean;
};

/** One entry per grant row — used to render one card per role on the access list page. */
export type UserAccessGrant = {
  permitId: string;
  userId: string;
  displayName: string;
  accountPhoto?: string;
  isSelf: boolean;
  role: {
    id: string;
    name: string;
    description?: string;
  };
};

export type AccessDetails = {
  permitId: string;
  grantedTo: {
    id: string;
    name: string;
    neupId: string;
  };
  /** The account whose resources are being accessed (accessTo). */
  account: {
    id: string;
    name: string;
  };
  /** Set when this grant is scoped to a portfolio. */
  portfolio: {
    id: string;
    name: string;
    description?: string;
  } | null;
  /** The role assigned to this grant. */
  role: {
    id: string;
    name: string;
    description?: string;
  };
};

/**
 * Function getMasterPermissions.
 */
export async function getMasterPermissions(): Promise<Permission[]> {
    const permissions = await prisma.authzPermission.findMany({
        where: { appId: 'neup.account' },
        select: { name: true },
        orderBy: { name: 'asc' },
    });

    const unique = Array.from(new Set(permissions.map(c => c.name)));
    return unique.map(name => ({ id: name, name }));
}


/**
 * Type Invitation.
 */
export type Invitation = {
    permitId: string;
    grantedBy: {
        name: string;
        neupId: string;
        accountPhoto?: string;
    };
    grantedOn: string;
}

const addAccessSchema = z.object({
    neupId: z.string().min(3, "NeupID must be at least 3 characters."),
});

const statusOrder: Record<UserAccess['status'], number> = {
    'approved': 1,
    'pending': 2,
    'rejected': 3,
};


/**
 * Function getAccessList.
 * Returns only grants that are NOT associated with a portfolio.
 * Multiple grants for the same account are merged into a single entry with all permissions combined.
 */
export async function getAccessList(accountId: string): Promise<UserAccess[]> {
  try {
    const grants = await prisma.member.findMany({
      where: {
        accessTo: accountId,
        accessFor: 'account',
        parentApplicationId: 'neup.account',
        parentPortfolioId: null,
      },
    });

    // Group grants by memberId, merging permissions
    const grouped = new Map<string, { roleIds: string[]; isSelf: boolean }>();
    for (const grant of grants) {
      const existing = grouped.get(grant.memberId);
      if (existing) {
        existing.roleIds.push(grant.roleId);
      } else {
        grouped.set(grant.memberId, {
          roleIds: [grant.roleId],
          isSelf: grant.accessTo === grant.memberId,
        });
      }
    }

    // Resolve profiles for each unique account
    const accessList = await Promise.all(
      Array.from(grouped.entries()).map(async ([memberId, { roleIds, isSelf }]) => {
        const userProfile = await getUserProfile(memberId);
        if (!userProfile) return null;

        // Use the grant id of the first grant as a stable key for linking to /access/[id]
        const firstGrant = grants.find((g) => g.memberId === memberId);
        if (!firstGrant) return null;

        return {
          permitId: firstGrant.id,
          userId: memberId,
          displayName:
            userProfile.nameDisplay ||
            `${userProfile.nameFirst ?? ''} ${userProfile.nameLast ?? ''}`.trim(),
          accountPhoto: userProfile.accountPhoto,
          permissions: roleIds,
          status: 'approved' as const,
          isSelf,
        };
      })
    );

    return accessList.filter((u): u is NonNullable<typeof u> => u !== null);

  } catch (error) {
    await logError('database', error, `getAccessList for ${accountId}`);
    return [];
  }
}


/**
 * Function getAccessListByGrant.
 * Returns one entry per grant row (one per role), with role details resolved.
 * Used to render one card per role on the access list page.
 */
export async function getAccessListByGrant(accountId: string): Promise<UserAccessGrant[]> {
  try {
    const grants = await prisma.member.findMany({
      where: {
        accessTo: accountId,
        accessFor: 'account',
        parentApplicationId: 'neup.account',
        parentPortfolioId: null,
      },
      include: {
        role: { select: { id: true, name: true, description: true } },
      },
    });

    const results = await Promise.all(
      grants.map(async (grant) => {
        const userProfile = await getUserProfile(grant.memberId);
        if (!userProfile) return null;

        return {
          permitId: grant.id,
          userId: grant.memberId,
          displayName:
            userProfile.nameDisplay ||
            `${userProfile.nameFirst ?? ''} ${userProfile.nameLast ?? ''}`.trim(),
          accountPhoto: userProfile.accountPhoto,
          isSelf: grant.accessTo === grant.memberId,
          role: {
            id: grant.role.id,
            name: grant.role.name,
            description: grant.role.description ?? undefined,
          },
        };
      })
    );

    return results.filter((u): u is NonNullable<typeof u> => u !== null);
  } catch (error) {
    await logError('database', error, `getAccessListByGrant for ${accountId}`);
    return [];
  }
}


/**
 * Type DirectAccessGroup.
 * Represents the active account's direct (non-portfolio) access context
 * in the same shape used by the shared AccessGroupView component.
 */
export type DirectAccessMember = {
  /** The grant ID — used as a stable key */
  id: string;
  accountId: string;
  displayName: string;
  /** Role name shown as subtitle */
  subtitle: string;
};

export type DirectAccessGroup = {
  name: string;
  description?: string;
  members: DirectAccessMember[];
};

/**
 * Function getDirectAccessGroup.
 * Returns the active account's name and all accounts that have direct
 * (non-portfolio) grants on it, one entry per grant row.
 */
export async function getDirectAccessGroup(accountId: string): Promise<DirectAccessGroup | null> {
  try {
    const [accountProfile, grants] = await Promise.all([
      getUserProfile(accountId),
      prisma.member.findMany({
        where: {
          memberType: 'account',
          parentAccountId: accountId,
          parentType: 'account',
          parentPortfolioId: null,
        },
        include: {
          roles: {
            select: {
              roleName: true,
              authzRole: { select: { name: true } },
            },
            take: 1,
          },
        },
      }),
    ]);

    if (!accountProfile) return null;

    const name =
      accountProfile.nameDisplay ||
      `${accountProfile.nameFirst ?? ''} ${accountProfile.nameLast ?? ''}`.trim() ||
      accountId;

    const members = await Promise.all(
      grants.map(async (grant) => {
        if (!grant.memberAccountId) return null;
        const profile = await getUserProfile(grant.memberAccountId);
        const displayName =
          profile?.nameDisplay ||
          `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
          grant.memberAccountId;
        const roleName = grant.roles?.[0]?.roleName || grant.roles?.[0]?.authzRole?.name || 'Member';
        return {
          id: grant.id,
          accountId: grant.memberAccountId,
          displayName,
          subtitle: roleName,
        };
      })
    );

    return { name, members: members.filter((m): m is DirectAccessMember => m !== null) };
  } catch (error) {
    await logError('database', error, `getDirectAccessGroup for ${accountId}`);
    return null;
  }
}


/**
 * Type DirectMember — a unique member with their role count and photo.
 */
export type DirectMember = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
  roleCount: number;
  isPermanent: boolean;
  /** Grant status — 'active' for confirmed members, 'invited' for pending invitations. */
  status: 'active' | 'invited' | 'on_hold' | 'expired';
};

/**
 * Function getDirectMembers.
 *
 * Returns unique members with direct (non-portfolio) grants on the given account,
 * grouped by accountId with a total role count. Also includes accounts with a
 * pending access_invitation request (shown with status 'invited').
 */
export async function getDirectMembers(accountId: string): Promise<{ accountName: string; members: DirectMember[] }> {
  try {
    const [accountProfile, grants, pendingInvitations] = await Promise.all([
      getUserProfile(accountId),
      prisma.member.findMany({
        where: {
          memberType: 'account',
          parentAccountId: accountId,
          parentType: 'account',
          parentPortfolioId: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: { memberAccountId: true, status: true, isPermanent: true } as any,
      }) as unknown as Promise<Array<{ memberAccountId: string | null; status: string; isPermanent: boolean }>>,
      prisma.request.findMany({
        where: {
          action: 'access_invitation',
          senderId: accountId,
          status: 'pending',
        },
        select: { recipientId: true },
      }),
    ]);

    const accountName =
      accountProfile?.nameDisplay ||
      `${accountProfile?.nameFirst ?? ''} ${accountProfile?.nameLast ?? ''}`.trim() ||
      accountId;

    // Build a map of confirmed grant members: accountId → { roleCount, status }
    const grantMap = new Map<string, { roleCount: number; status: 'active' | 'invited' | 'on_hold' | 'expired'; isPermanent: boolean }>();
    for (const grant of grants) {
      if (!grant.memberAccountId) continue;
      const existing = grantMap.get(grant.memberAccountId);
      const validStatuses = ['active', 'invited', 'on_hold', 'expired'] as const;
      const grantStatus: 'active' | 'invited' | 'on_hold' | 'expired' =
        validStatuses.includes(grant.status as typeof validStatuses[number])
          ? (grant.status as 'active' | 'invited' | 'on_hold' | 'expired')
          : 'active';
      if (existing) {
        existing.roleCount += 1;
        existing.isPermanent = existing.isPermanent || grant.isPermanent;
      } else {
        grantMap.set(grant.memberAccountId, { roleCount: 1, status: grantStatus, isPermanent: grant.isPermanent });
      }
    }

    // Collect invited account IDs that don't already have a confirmed grant
    const invitedIds = pendingInvitations
      .map((r) => r.recipientId)
      .filter((id) => !grantMap.has(id));

    // Resolve profiles for confirmed grant members
    const confirmedMembers = await Promise.all(
      Array.from(grantMap.entries()).map(async ([memberId, { roleCount, status, isPermanent }]) => {
        const profile = await getUserProfile(memberId);
        const displayName =
          profile?.nameDisplay ||
          `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
          memberId;
        return {
          accountId: memberId,
          displayName,
          accountPhoto: profile?.accountPhoto,
          roleCount,
          isPermanent,
          status,
        };
      })
    );

    // Resolve profiles for invited (pending) accounts
    const invitedMembers = await Promise.all(
      invitedIds.map(async (memberId) => {
        const profile = await getUserProfile(memberId);
        const displayName =
          profile?.nameDisplay ||
          `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
          memberId;
        return {
          accountId: memberId,
          displayName,
          accountPhoto: profile?.accountPhoto,
          roleCount: 0,
          isPermanent: false,
          status: 'invited' as const,
        };
      })
    );

    // Active/confirmed members first, then invited
    const members = [...confirmedMembers, ...invitedMembers];

    return { accountName, members };
  } catch (error) {
    await logError('database', error, `getDirectMembers for ${accountId}`);
    return { accountName: accountId, members: [] };
  }
}


/**
 * Function getAccessDetails.
 */
export async function getAccessDetails(permitId: string): Promise<AccessDetails | null> {
    try {
        const grant = await prisma.member.findUnique({
          where: { id: permitId },
          include: {
            role: { select: { id: true, name: true, description: true } },
            portfolio: { select: { id: true, name: true, description: true } },
          },
        });

        if (!grant) {
            return null;
        }

        // In member: accessTo = the account being managed,
        // memberId = the accessor who was granted access (grantedTo).
        const [grantedToProfile, accountProfile, grantedToNeupIds] = await Promise.all([
            getUserProfile(grant.memberId),
            getUserProfile(grant.accessTo),
            getUserNeupIds(grant.memberId),
        ]);

        if (!grantedToProfile || !accountProfile) {
            return null;
        }

        return {
            permitId: grant.id,
            grantedTo: {
                id: grant.memberId,
                name: grantedToProfile.nameDisplay || `${grantedToProfile.nameFirst} ${grantedToProfile.nameLast}`.trim(),
                neupId: grantedToNeupIds[0] || 'N/A',
            },
            account: {
                id: grant.accessTo,
                name: accountProfile.nameDisplay || `${accountProfile.nameFirst} ${accountProfile.nameLast}`.trim(),
            },
            portfolio: grant.portfolio
                ? {
                    id: grant.portfolio.id,
                    name: grant.portfolio.name,
                    description: grant.portfolio.description ?? undefined,
                  }
                : null,
            role: {
                id: grant.role.id,
                name: grant.role.name,
                description: grant.role.description ?? undefined,
            },
        };

    } catch (error) {
        await logError('database', error, `getAccessDetails for ${permitId}`);
        return null;
    }
}


/**
 * Function removeAccess.
 */
export async function removeAccess(permitId: string, geolocation?: string): Promise<{ success: boolean; error?: string }> {
    const currentAccountId = await getActiveAccountId();
     if (!currentAccountId) {
        return { success: false, error: "Not authenticated." };
    }
    
    try {
        const grant = await prisma.member.findUnique({
          where: { id: permitId }
        });

        if (!grant || grant.accessTo !== currentAccountId) {
            return { success: false, error: "Permission denied or grant not found." };
        }
        
        const removedUserId = grant.memberId;
        await prisma.member.delete({
          where: { id: permitId }
        });

        await logActivity(currentAccountId, `Revoked access for user ${removedUserId}`, 'Success', undefined, undefined, geolocation);
        
        revalidatePath('/manage/access');
        revalidatePath(`/manage/access/${permitId}`);
        return { success: true };
    } catch (error) {
        await logError('database', error, `removeAccess: ${permitId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function getDelegatablePermissions.
 */
export async function getDelegatablePermissions(): Promise<Permission[]> {
    await requireAnyPermission404(['security.third_party.view.self']);
    const managedAccountId = await getActiveAccountId();
    if (!managedAccountId) return [];

    // Get all permissions the current user has on the active account
    const userPermissions = await getAccountPermission(managedAccountId);
    
    // Convert to Permission objects
    return userPermissions.sort().map(p => ({
        id: p,
        name: p
    }));
}


/**
 * Function updatePermissions.
 */
export async function updatePermissions(permitId: string, newPermissionIds: string[], geolocation?: string): Promise<{ success: boolean, error?: string}> {
    const currentAccountId = await getActiveAccountId();
    if (!currentAccountId) {
        return { success: false, error: "Not authenticated." };
    }

    await requireAnyPermission404(['security.third_party.add.self']);
    const canAdd = await checkPermissions(['security.third_party.add.self']);
    if (!canAdd) {
        return { success: false, error: 'Permission denied.' };
    }

    try {
        const grant = await prisma.member.findUnique({
          where: { id: permitId }
        });

        if (!grant || grant.accessTo !== currentAccountId) {
            return { success: false, error: "Permission denied or grant not found." };
        }

        // --- Permission Delegation Check ---
        const userResolvedPermissions = await getAccountPermission(currentAccountId);
        const userResolvedPermSet = new Set(userResolvedPermissions);

        const isAllowed = newPermissionIds.every(p => userResolvedPermSet.has(p));
        if (!isAllowed) {
            return { success: false, error: "You are trying to grant permissions you do not possess." };
        }
        // --- End Check ---

        const targetUserId = grant.memberId;

        if (newPermissionIds.length === 0) {
            await prisma.member.delete({ where: { id: permitId } });
        } else {
            // The new model stores a single roleId per grant; use the first permission as the role.
            await prisma.member.update({
              where: { id: permitId },
              data: { roleId: newPermissionIds[0] },
            });
        }
        
        await logActivity(currentAccountId, `Updated permissions for user ${targetUserId}`, 'Success', undefined, undefined, geolocation);
        revalidatePath('/manage/access');
        revalidatePath(`/manage/access/${permitId}`);
        return { success: true };

    } catch (error) {
        await logError('database', error, `updatePermissions: ${permitId}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Function grantAccessByNeupId.
 */
export async function grantAccessByNeupId(formData: FormData, geolocation?: string): Promise<{ success: boolean; error?: string; }> {
    const accessTo = await getActiveAccountId();
    if (!accessTo) {
        return { success: false, error: "Not authenticated." };
    }

    await requireAnyPermission404(['security.third_party.add.self']);
    const canAdd = await checkPermissions(['security.third_party.add.self']);
    if (!canAdd) {
        return { success: false, error: 'Permission denied.' };
    }

    const validation = addAccessSchema.safeParse({ neupId: formData.get('neupId') });
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().fieldErrors.neupId?.[0] };
    }
    const neupId = validation.data.neupId.toLowerCase();

    try {
        // Find the account to add
        const neupIdRecord = await prisma.neupId.findUnique({
          where: { id: neupId }
        });

        if (!neupIdRecord) {
            return { success: false, error: "No user found with that NeupID." };
        }
        const memberId = neupIdRecord.accountId;

        // Prevent adding self
        if (memberId === accessTo) {
            return { success: false, error: "You cannot grant access to yourself." };
        }
        
        const targetAccountType = await getAccountType(memberId);
        if (targetAccountType !== 'individual' && targetAccountType !== 'dependent') {
            return { success: false, error: "You can only grant access to individual accounts." };
        }


        // Check if already added
        const alreadyExists = await prisma.member.findFirst({
          where: {
            accessTo: accessTo,
            memberId: memberId,
            accessFor: 'account',
            parentApplicationId: 'neup.account',
          }
        });

        if (alreadyExists) {
            return { success: false, error: "This user already has access." };
        }
        
        const existingRequest = await prisma.request.findFirst({
          where: {
            action: 'access_invitation',
            senderId: accessTo,
            recipientId: memberId,
            status: 'pending'
          }
        });

        if(existingRequest) {
            return { success: false, error: 'An invitation has already been sent to this user.' };
        }


        // Add the new access document with a 'pending' status
        const request = await prisma.request.create({
          data: {
            action: 'access_invitation',
            senderId: accessTo,
            recipientId: memberId,
            status: 'pending'
          }
        });
        
        await prisma.notification.create({
          data: {
            accountId: memberId,
            action: 'access_invitation',
            title: 'New Access Invitation',
            message: `You have received an access invitation from ${accessTo}`,
            type: 'info',
            read: false,
            detail: { requestId: request.id }
          }
        });


        await logActivity(accessTo, `Sent access invitation to ${neupId}`, 'Pending', undefined, undefined, geolocation);
        revalidatePath('/manage/access');
        return { success: true };

    } catch (error) {
        await logError('database', error, 'grantAccessByNeupId');
        return { success: false, error: 'An unexpected error occurred.' };
    }
}


/**
 * Type DirectMemberDetail — a member's profile + their direct grants on an account.
 */
export type DirectMemberDetail = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
  roles: { roleId: string; roleName: string; roleDescription?: string }[];
};

/**
 * Function getDirectMemberDetail.
 *
 * Returns the display name and all direct (non-portfolio) roles a member holds
 * on the given owner account.
 */
export async function getDirectMemberDetail(
  accessTo: string,
  memberAccountId: string,
): Promise<DirectMemberDetail | null> {
  try {
    const [profile, grants] = await Promise.all([
      getUserProfile(memberAccountId),
      prisma.member.findMany({
        where: {
          memberType: 'account',
          parentAccountId: accessTo,
          parentType: 'account',
          memberAccountId,
          parentPortfolioId: null,
        },
        include: {
          roles: {
            select: {
              roleId: true,
              roleName: true,
              authzRole: { select: { name: true, description: true } },
            },
          },
        },
      }),
    ]);

    if (!profile) return null;

    const displayName =
      profile.nameDisplay ||
      `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim() ||
      memberAccountId;

    return {
      accountId: memberAccountId,
      displayName,
      accountPhoto: profile.accountPhoto,
      roles: grants.flatMap((g) =>
        g.roles.map((r) => ({
          roleId: r.roleId,
          roleName: r.roleName ?? r.authzRole?.name ?? r.roleId,
          roleDescription: r.authzRole?.description ?? undefined,
        })),
      ),
    };
  } catch (error) {
    await logError('database', error, `getDirectMemberDetail:${accessTo}:${memberAccountId}`);
    return null;
  }
}

/**
 * Type PortfolioMemberRole — a role held by a member on an asset within a portfolio.
 */
export type PortfolioMemberRole = {
  roleId: string;
  roleName: string;
  roleDescription?: string;
  assetId: string;
  assetName: string;
  assetType: string;
};

/**
 * Type PortfolioMemberDetail — a member's profile + their roles in a portfolio.
 */
export type PortfolioMemberDetail = {
  accountId: string;
  displayName: string;
  portfolioName: string;
  /** 'active' | 'invited' | 'expired' */
  status: string;
  invitationExpiresOn?: string;
  roles: PortfolioMemberRole[];
};

/**
 * Type PortfolioMemberSummary — a member with their role count for the list view.
 */
export type PortfolioMemberSummary = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
  roleCount: number;
  /** Member status — 'active' for confirmed members, 'invited' for pending invitations, 'expired' for lapsed invitations. */
  status: 'active' | 'invited' | 'expired';
  /** For invited members: when the invitation expires (ISO string). */
  invitationExpiresOn?: string;
};

/**
 * Function getPortfolioMembers.
 *
 * Returns all members of a portfolio with their display name, photo, and
 * total number of roles assigned across all assets in the portfolio.
 * Includes active members and invited (pending) members from portfolio_member.status.
 */
export async function getPortfolioMembers(
  parentPortfolioId: string,
): Promise<{ portfolioName: string; members: PortfolioMemberSummary[] }> {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: parentPortfolioId },
      select: {
        name: true,
        members: {
          select: {
            accountId: true,
            status: true,
            details: true,
          },
        },
      },
    });

    if (!portfolio) return { portfolioName: '', members: [] };

    let supportsAssetsGrantTable = true;
    const members = await Promise.all(
      portfolio.members.map(async ({ accountId: memberAccountId, status, details }) => {
        const profile = await getUserProfile(memberAccountId);
        const displayName =
          profile?.nameDisplay ||
          `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
          memberAccountId;

        // For active members, count their asset grants
        let roleCount = 0;
        if (status === 'active' && supportsAssetsGrantTable) {
          try {
            roleCount = await prisma.authzAssetsAccessGrant.count({
              where: {
                account_id: memberAccountId,
                portfolio_id: parentPortfolioId,
                app_id: 'neup.account',
              },
            });
          } catch (error) {
            if (isMissingAssetsGrantTableError(error)) {
              supportsAssetsGrantTable = false;
              roleCount = 0;
            } else {
              throw error;
            }
          }
        }

        // Resolve invitation expiry for invited members
        const detailsObj = details as Record<string, unknown> | null;
        const invitationExpiresOn =
          status === 'invited' && typeof detailsObj?.expiresOn === 'string'
            ? detailsObj.expiresOn
            : undefined;

        // Determine effective status — mark as expired if past expiresOn
        let effectiveStatus: 'active' | 'invited' | 'expired' = status as 'active' | 'invited' | 'expired';
        if (status === 'invited' && invitationExpiresOn) {
          const expiresOn = new Date(invitationExpiresOn);
          if (!Number.isNaN(expiresOn.getTime()) && expiresOn < new Date()) {
            effectiveStatus = 'expired';
          }
        }

        return {
          accountId: memberAccountId,
          displayName,
          accountPhoto: profile?.accountPhoto,
          roleCount,
          status: effectiveStatus,
          invitationExpiresOn,
        };
      })
    );

    return { portfolioName: portfolio.name, members };
  } catch (error) {
    await logError('database', error, `getPortfolioMembers:${parentPortfolioId}`);
    return { portfolioName: '', members: [] };
  }
}

/**
 * Function getPortfolioMemberDetail.
 *
 * Returns the display name of a member and all roles they hold on assets
 * within the given portfolio. Also returns invited members (status = 'invited')
 * with an empty roles array so the role page can show their invitation state.
 * Returns null only if the account profile or portfolio does not exist, or if
 * the account has no PortfolioMember row at all.
 */
export async function getPortfolioMemberDetail(
  parentPortfolioId: string,
  memberAccountId: string,
): Promise<PortfolioMemberDetail | null> {
  try {
    const [portfolio, memberProfile, memberRow] = await Promise.all([
      prisma.portfolio.findUnique({
        where: { id: parentPortfolioId },
        select: { name: true },
      }),
      getUserProfile(memberAccountId),
      prisma.member.findFirst({
        where: { parentPortfolioId, accountId: memberAccountId },
        select: { status: true, details: true },
      }),
    ]);

    if (!portfolio || !memberProfile || !memberRow) return null;

    const displayName =
      memberProfile.nameDisplay ||
      `${memberProfile.nameFirst ?? ''} ${memberProfile.nameLast ?? ''}`.trim() ||
      memberAccountId;

    // Resolve invitation expiry
    const detailsObj = memberRow.details as Record<string, unknown> | null;
    const invitationExpiresOn =
      memberRow.status === 'invited' && typeof detailsObj?.expiresOn === 'string'
        ? detailsObj.expiresOn
        : undefined;

    // Determine effective status
    let effectiveStatus = memberRow.status;
    if (memberRow.status === 'invited' && invitationExpiresOn) {
      const expiresOn = new Date(invitationExpiresOn);
      if (!Number.isNaN(expiresOn.getTime()) && expiresOn < new Date()) {
        effectiveStatus = 'expired';
      }
    }

    // Invited/expired members have no asset grants yet
    if (effectiveStatus !== 'active') {
      return {
        accountId: memberAccountId,
        displayName,
        portfolioName: portfolio.name,
        status: effectiveStatus,
        invitationExpiresOn,
        roles: [],
      };
    }

    // Fetch all asset grants for active members
    let grants: Array<{
      role_id: string;
      role: { id: string; name: string; description: string | null };
      asset: { id: string; assetId: string; assetType: string };
    }> = [];
    try {
      grants = await prisma.authzAssetsAccessGrant.findMany({
        where: {
          account_id: memberAccountId,
          portfolio_id: parentPortfolioId,
          app_id: 'neup.account',
        },
        select: {
          role_id: true,
          role: { select: { id: true, name: true, description: true } },
          asset: {
            select: {
              id: true,
              assetId: true,
              assetType: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingAssetsGrantTableError(error)) {
        throw error;
      }
    }

    // Resolve asset names
    const { resolveAssetName } = await import('@/services/manage/access/asset-resolvers');

    const roles = await Promise.all(
      grants.map(async (grant) => {
        const resolved = await resolveAssetName(grant.asset.assetId, grant.asset.assetType);
        return {
          roleId: grant.role.id,
          roleName: grant.role.name,
          roleDescription: grant.role.description ?? undefined,
          assetId: grant.asset.assetId,
          assetName: resolved.name,
          assetType: grant.asset.assetType,
        };
      })
    );

    return {
      accountId: memberAccountId,
      displayName,
      portfolioName: portfolio.name,
      status: 'active',
      roles,
    };
  } catch (error) {
    await logError('database', error, `getPortfolioMemberDetail:${parentPortfolioId}:${memberAccountId}`);
    return null;
  }
}

/**
 * Type MyDirectRole — a role the current user holds directly on an account.
 */
export type MyDirectRole = {
  roleId: string;
  roleName: string;
  roleDescription?: string;
  accessTo: string;
  ownerName: string;
};

/**
 * Function getMyDirectRoles.
 *
 * Returns all direct (non-portfolio) roles the current user holds on the
 * given owner account (i.e. grants where memberId = current user).
 */
export async function getMyDirectRoles(
  accessTo: string,
): Promise<{ ownerName: string; myName: string; roles: MyDirectRole[] } | null> {
  try {
    const myAccountId = await getActiveAccountId();
    if (!myAccountId) return null;

    const [ownerProfile, myProfile, grants] = await Promise.all([
      getUserProfile(accessTo),
      getUserProfile(myAccountId),
      prisma.member.findMany({
        where: {
          memberType: 'account',
          parentAccountId: accessTo,
          parentType: 'account',
          memberAccountId: myAccountId,
          parentPortfolioId: null,
        },
        include: {
          roles: {
            select: {
              roleId: true,
              roleName: true,
              authzRole: { select: { name: true, description: true } },
            },
          },
        },
      }),
    ]);

    if (!ownerProfile) return null;

    const ownerName =
      ownerProfile.nameDisplay ||
      `${ownerProfile.nameFirst ?? ''} ${ownerProfile.nameLast ?? ''}`.trim() ||
      accessTo;

    const myName =
      myProfile?.nameDisplay ||
      `${myProfile?.nameFirst ?? ''} ${myProfile?.nameLast ?? ''}`.trim() ||
      myAccountId;

    return {
      ownerName,
      myName,
      roles: grants.flatMap((g) => g.roles.map((r) => ({
        roleId: r.roleId,
        roleName: r.roleName ?? r.authzRole?.name ?? r.roleId,
        roleDescription: r.authzRole?.description ?? undefined,
        accessTo,
        ownerName,
      }))),
    };
  } catch (error) {
    await logError('database', error, `getMyDirectRoles:${accessTo}`);
    return null;
  }
}

/**
 * Type MyPortfolioRole — a role the current user holds on an asset within a portfolio.
 */
export type MyPortfolioRole = {
  roleId: string;
  roleName: string;
  roleDescription?: string;
  assetId: string;
  assetName: string;
  assetType: string;
};

/**
 * Function getMyPortfolioRoles.
 *
 * Returns all roles the current user holds on assets within the given portfolio.
 */
export async function getMyPortfolioRoles(
  parentPortfolioId: string,
): Promise<{ portfolioName: string; myName: string; roles: MyPortfolioRole[] } | null> {
  try {
    const myAccountId = await getActiveAccountId();
    if (!myAccountId) return null;

    const [portfolio, myProfile, grants] = await Promise.all([
      prisma.portfolio.findUnique({
        where: { id: parentPortfolioId },
        select: { name: true },
      }),
      getUserProfile(myAccountId),
      prisma.authzAssetsAccessGrant.findMany({
        where: {
          account_id: myAccountId,
          portfolio_id: parentPortfolioId,
          app_id: 'neup.account',
        },
        select: {
          role_id: true,
          role: { select: { id: true, name: true, description: true } },
          asset: { select: { id: true, assetId: true, assetType: true } },
        },
      }),
    ]);

    if (!portfolio) return null;

    const myName =
      myProfile?.nameDisplay ||
      `${myProfile?.nameFirst ?? ''} ${myProfile?.nameLast ?? ''}`.trim() ||
      myAccountId;

    const { resolveAssetName } = await import('@/services/manage/access/asset-resolvers');

    const roles = await Promise.all(
      grants.map(async (grant) => {
        const resolved = await resolveAssetName(grant.asset.assetId, grant.asset.assetType);
        return {
          roleId: grant.role.id,
          roleName: grant.role.name,
          roleDescription: grant.role.description ?? undefined,
          assetId: grant.asset.assetId,
          assetName: resolved.name,
          assetType: grant.asset.assetType,
        };
      })
    );

    return { portfolioName: portfolio.name, myName, roles };
  } catch (error) {
    await logError('database', error, `getMyPortfolioRoles:${parentPortfolioId}`);
    return null;
  }
}
