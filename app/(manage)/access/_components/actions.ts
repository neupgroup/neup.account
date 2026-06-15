'use server';

import prisma from '@/core/helpers/prisma';
import { Prisma } from '@/prisma/generated/client';
import { getUserProfile } from '@/services/user';
import { getPersonalAccountId, getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { assignAssetMemberRole, getRolesForAsset } from '@/services/manage/access/assets';
import { isRootUser } from '@/services/user';

export type ResolvedAccount = {
  accountId: string;
  displayName: string;
};

export async function resolveNeupId(
  neupId: string,
): Promise<{ success: true; account: ResolvedAccount } | { success: false; error: string }> {
  const normalized = neupId.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return { success: false, error: 'NeupID must be at least 3 characters.' };
  }

  const record = await prisma.neupId.findUnique({
    where: { id: normalized },
    select: { accountId: true },
  });

  if (!record) {
    return { success: false, error: 'No account found with that NeupID.' };
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
        roleId: 'brand-owner-neup-account',
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
 * Returns all branch accounts under the currently active brand account.
 */
async function getBranchAssets(): Promise<SelectableAsset[]> {
  try {
    const activeAccountId = await getActiveAccountId();
    if (!activeAccountId) return [];

    // Branches are owned by the active brand account — find them via AccountOwnership
    // which maps parentId (brand) → childrenId (branch). Fall back to empty if table missing.
    const branches = await prisma.account.findMany({
      where: {
        accountType: 'branch',
        parentOwnerships: {
          some: { parentId: activeAccountId },
        },
      },
      include: { neupIds: { where: { isPrimary: true }, select: { id: true } } },
    });

    return branches.map((a) => ({
      assetId: a.id,
      name: a.displayName || 'Unnamed Branch',
      assetType: 'branch_account',
      subtitle: a.neupIds[0]?.id,
    }));
  } catch (error) {
    await logError('database', error, 'getBranchAssets');
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

export type AssetType = 'brand_account' | 'branch_account' | 'application';

export async function getSelectableAssets(
  type: AssetType,
  excludeAssetIds?: string[],
): Promise<SelectableAsset[]> {
  let assets: SelectableAsset[];
  switch (type) {
    case 'brand_account':
      assets = await getBrandAssets();
      break;
    case 'branch_account':
      assets = await getBranchAssets();
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
): Promise<{ success: boolean; error?: string }> {
  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'Not authenticated.' };

  // Nobody can remove the account owner's own direct grants:
  // - not a delegated actor (personalAccountId !== accessTo)
  // - not the owner themselves
  if (memberAccountId === accessTo) {
    return { success: false, error: 'Direct account roles cannot be removed.' };
  }

  try {
    await prisma.member.deleteMany({
      where: {
        memberType: 'account',
        memberAccountId,
        parentAccountId: accessTo,
        parentPortfolioId: null,
      },
    });
    await prisma.access.deleteMany({
      where: {
        memberAccountId,
        parentAccountId: accessTo,
        parentPortfolioId: null,
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
): Promise<{ success: boolean; error?: string }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    await prisma.request.deleteMany({
      where: {
        action: 'access_invitation',
        senderId: senderAccountId,
        recipientId: recipientAccountId,
        status: 'pending',
      },
    });

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
  parentPortfolioId: string,
  memberAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const member = await prisma.member.findFirst({
      where: { parentPortfolioId, memberAccountId: memberAccountId, memberType: 'account' },
      select: { id: true },
    });

    if (!member) return { success: false, error: 'Member not found in this portfolio.' };

    return await removeAssetGroupMember({ groupId: parentPortfolioId, memberId: member.id });
  } catch (error) {
    await logError('database', error, `removePortfolioMember:${parentPortfolioId}:${memberAccountId}`);
    return { success: false, error: 'Failed to remove member.' };
  }
}

/**
 * Cancels a pending portfolio membership invitation by removing the
 * PortfolioMember row with status 'invited' or 'expired'.
 */
export async function cancelPortfolioInvitation(
  parentPortfolioId: string,
  recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    const member = await prisma.member.findFirst({
      where: {
        parentPortfolioId,
        memberAccountId: recipientAccountId,
        memberType: 'account',
        status: { in: ['paused', 'removed'] },
      },
      select: { id: true },
    });

    if (member) {
      await prisma.member.delete({ where: { id: member.id } });
    }

    revalidatePath('/access');
    revalidatePath(`/access/team?portfolio=${parentPortfolioId}`);
    revalidatePath(`/access/role?portfolio=${parentPortfolioId}&member_id=${recipientAccountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `cancelPortfolioInvitation:${parentPortfolioId}:${recipientAccountId}`);
    return { success: false, error: 'Failed to cancel invitation.' };
  }
}

/**
 * Sends a portfolio membership invitation to an account that is not yet a member.
 * Role is null at invite time — flags default to isPermanent: false, hasFullAccess: false.
 */
export async function inviteToPortfolio(
  parentPortfolioId: string,
  recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const { addAssetGroupMember } = await import('@/services/manage/access/assets');
  return addAssetGroupMember({ groupId: parentPortfolioId, member: recipientAccountId });
}

/**
 * Sends a direct (non-portfolio) access invitation to an account that has no
 * existing grants on the active account. Role is null at invite time.
 */
export async function inviteDirectMember(
  recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    // Prevent inviting self
    if (recipientAccountId === senderAccountId) {
      return { success: false, error: 'You cannot invite yourself.' };
    }

    // Check for existing grants
    const existingGrant = await prisma.member.findFirst({
      where: {
        memberType: 'account',
        memberAccountId: recipientAccountId,
        parentAccountId: senderAccountId,
        parentPortfolioId: null,
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
    revalidatePath(`/access/role?member_id=${recipientAccountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `inviteDirectMember:${recipientAccountId}`);
    return { success: false, error: 'Failed to send invitation.' };
  }
}

/**
 * Finds a portfolio-asset row from either row ID or logical assetId.
 */
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
    member_portfolio_id: string | null;
  }): string => row.member_account_id ?? row.access_application_id ?? row.member_connection_id ?? row.member_portfolio_id ?? row.id;

  const byRow = await prisma.asset.findUnique({
    where: { id: assetRef },
    select: {
      id: true,
      access_type: true,
      member_account_id: true,
      access_application_id: true,
      member_connection_id: true,
      member_portfolio_id: true,
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
        { member_portfolio_id: assetRef },
      ],
    },
    select: {
      id: true,
      access_type: true,
      member_account_id: true,
      access_application_id: true,
      member_connection_id: true,
      member_portfolio_id: true,
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
