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
  /** The assetType string stored in portfolioAsset.assetType */
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

    const grants = await prisma.authzAccountAccessGrant.findMany({
      where: {
        targetAccountId: personalAccountId,
        roleId: 'brand-owner-neup-account',
        appId: 'neup.account',
      },
      select: { ownerAccountId: true },
    });

    const ids = grants.map((g) => g.ownerAccountId);
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

    const grants = await prisma.authzAccountAccessGrant.findMany({
      where: { ownerAccountId: accountId, roleId: 'application.owner' },
      select: {
        application: { select: { id: true, name: true, status: true } },
      },
    });

    return grants.map((g) => ({
      assetId: g.application.id,
      name: g.application.name,
      assetType: 'application',
      subtitle: g.application.status ?? undefined,
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
 *   Only the owner themselves (personalAccountId === ownerAccountId) can
 *   remove their own access. A member who was granted access later cannot
 *   remove the grants of the account that originally owns the resource.
 */
export async function removeDirectMember(
  memberAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const ownerAccountId = await getActiveAccountId();
  if (!ownerAccountId) return { success: false, error: 'Not authenticated.' };

  // Nobody can remove the account owner's own direct grants:
  // - not a delegated actor (personalAccountId !== ownerAccountId)
  // - not the owner themselves
  if (memberAccountId === ownerAccountId) {
    return { success: false, error: 'Direct account roles cannot be removed.' };
  }

  try {
    await prisma.authzAccountAccessGrant.deleteMany({
      where: {
        ownerAccountId,
        targetAccountId: memberAccountId,
        appId: 'neup.account',
        portfolioId: null,
      },
    });

    await logActivity(ownerAccountId, `Removed all direct access for ${memberAccountId}`, 'Success');
    revalidatePath('/access');
    revalidatePath('/access/member');
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
    revalidatePath('/access/member');
    return { success: true };
  } catch (error) {
    await logError('database', error, `cancelDirectInvitation:${recipientAccountId}`);
    return { success: false, error: 'Failed to cancel invitation.' };
  }
}

/**
 * Removes a member from a portfolio by looking up their portfolioMember row
 * and delegating to removeAssetGroupMember.
 */
export async function removePortfolioMember(
  portfolioId: string,
  memberAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const member = await prisma.portfolioMember.findFirst({
      where: { portfolioId, accountId: memberAccountId },
      select: { id: true },
    });

    if (!member) return { success: false, error: 'Member not found in this portfolio.' };

    return await removeAssetGroupMember({ groupId: portfolioId, memberId: member.id });
  } catch (error) {
    await logError('database', error, `removePortfolioMember:${portfolioId}:${memberAccountId}`);
    return { success: false, error: 'Failed to remove member.' };
  }
}

/**
 * Cancels a pending portfolio membership invitation by removing the
 * PortfolioMember row with status 'invited' or 'expired'.
 */
export async function cancelPortfolioInvitation(
  portfolioId: string,
  recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  try {
    const member = await prisma.portfolioMember.findFirst({
      where: {
        portfolioId,
        accountId: recipientAccountId,
        status: { in: ['invited', 'expired'] },
      },
      select: { id: true },
    });

    if (member) {
      await prisma.portfolioMember.delete({ where: { id: member.id } });
    }

    revalidatePath('/access');
    revalidatePath(`/access/member?portfolio=${portfolioId}`);
    revalidatePath(`/access/role?portfolio=${portfolioId}&member=${recipientAccountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `cancelPortfolioInvitation:${portfolioId}:${recipientAccountId}`);
    return { success: false, error: 'Failed to cancel invitation.' };
  }
}

/**
 * Sends a portfolio membership invitation to an account that is not yet a member.
 * Role is null at invite time — flags default to isPermanent: false, hasFullAccess: false.
 */
export async function inviteToPortfolio(
  portfolioId: string,
  recipientAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const { addAssetGroupMember } = await import('@/services/manage/access/assets');
  return addAssetGroupMember({ groupId: portfolioId, member: recipientAccountId });
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
    const existingGrant = await prisma.authzAccountAccessGrant.findFirst({
      where: {
        ownerAccountId: senderAccountId,
        targetAccountId: recipientAccountId,
        appId: 'neup.account',
        portfolioId: null,
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
        data: { path: ['portfolioId'], equals: Prisma.JsonNull },
      },
      select: { id: true, data: true },
    });

    // Fallback: also check without portfolioId filter (direct invitations may not have data)
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
      !(existingInvitationFallback.data as Record<string, unknown> | null)?.portfolioId
    ) {
      return { success: false, error: 'An invitation has already been sent to this account.' };
    }

    // Invitation expires 7 days from now
    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + 7);

    await prisma.request.create({
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

    revalidatePath('/access');
    revalidatePath('/access/member');
    revalidatePath(`/access/role?member=${recipientAccountId}`);
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
  const byRow = await prisma.asset.findUnique({
    where: { id: assetRef },
    select: { id: true, assetId: true, assetType: true },
  });
  if (byRow) return { rowId: byRow.id, assetId: byRow.assetId, assetType: byRow.assetType };

  const byLogical = await prisma.asset.findFirst({
    where: { assetId: assetRef },
    select: { id: true, assetId: true, assetType: true },
    orderBy: { id: 'asc' },
  });
  if (!byLogical) return null;
  return { rowId: byLogical.id, assetId: byLogical.assetId, assetType: byLogical.assetType };
}

export async function assignOrInviteAssetMember(input: {
  assetRef: string;
  targetAccountId: string;
  rootMode?: boolean;
}): Promise<{ success: boolean; error?: string; mode?: 'assigned' | 'invited' }> {
  const senderAccountId = await getActiveAccountId();
  if (!senderAccountId) return { success: false, error: 'Not authenticated.' };

  if (!input.assetRef || !input.targetAccountId) {
    return { success: false, error: 'Missing required fields.' };
  }

  if (input.targetAccountId === senderAccountId) {
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

      const result = await assignAssetMemberRole({
        assetMember: input.targetAccountId,
        asset: asset.rowId,
        role: roles[0].id,
      }, { rootMode: true });

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to assign asset access.' };
      }

      revalidatePath('/access');
      revalidatePath(`/access/member?asset=${encodeURIComponent(asset.assetId)}&mode=root`);
      revalidatePath(`/access/asset?asset=${encodeURIComponent(asset.assetId)}&mode=root`);
      return { success: true, mode: 'assigned' };
    }

    const existingInvitation = await prisma.request.findFirst({
      where: {
        action: 'asset_access_invitation',
        senderId: senderAccountId,
        recipientId: input.targetAccountId,
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
        recipientId: input.targetAccountId,
        status: 'pending',
        data: {
          assetId: asset.assetId,
          assetType: asset.assetType,
          expiresOn: expiresOn.toISOString(),
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/member?asset=${encodeURIComponent(asset.assetId)}`);
    revalidatePath(`/access/asset?asset=${encodeURIComponent(asset.assetId)}`);
    return { success: true, mode: 'invited' };
  } catch (error) {
    await logError('database', error, `assignOrInviteAssetMember:${input.assetRef}:${input.targetAccountId}`);
    return { success: false, error: 'Failed to process asset member action.' };
  }
}
