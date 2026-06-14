// @ts-nocheck
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { Prisma } from '../../../prisma/generated/client/client';
import { getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { checkPermissions, getAccountType, isRootUser } from '@/services/user';
import { resolveAssetName } from '@/services/manage/access/asset-resolvers';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

const memberPattern = /^(account:)?[^\s:]+$/;

const createAssetGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required.').max(120, 'Group name is too long.'),
  details: z.string().trim().max(500, 'Details are too long.').optional().or(z.literal('')),
});

const addMemberSchema = z.object({
  groupId: z.string().min(1),
  member: z.string().trim().regex(memberPattern, 'Use account ID or account:<id>.'),
  isPermanent: z.boolean().default(false),
  validTill: z.date().optional(),
  hasFullPermit: z.boolean().default(false),
});

const addAssetSchema = z.object({
  groupId: z.string().min(1),
  asset: z.string().trim().min(1, 'Asset is required.').max(160, 'Asset is too long.'),
  type: z.string().trim().min(1, 'Type is required.').max(120, 'Type is too long.'),
  details: z.string().trim().max(500, 'Details are too long.').optional().or(z.literal('')),
});

const assignRoleSchema = z.object({
  groupId: z.string().min(1),
  assetMember: z.string().min(1),
  asset: z.string().min(1),
  role: z.string().trim().min(1, 'Role is required.').max(120, 'Role is too long.'),
});

const ACCESS_APP_ID = 'neup.account';
const PORTFOLIO_ASSET_TYPE_MAP: Record<string, string> = {
  brand_account: 'acc_in_port',
  branch_account: 'acc_in_port',
  application: 'app_in_port',
};

function toPortfolioAssetType(type: string): string {
  return PORTFOLIO_ASSET_TYPE_MAP[type.trim().toLowerCase()] ?? type.trim().toLowerCase();
}

function toLogicalAssetId(row: {
  id: string;
  asset_account_id: string | null;
  asset_application_id: string | null;
  asset_connection_id: string | null;
  asset_portfolio_id: string | null;
}): string {
  return (
    row.asset_account_id ??
    row.asset_application_id ??
    row.asset_connection_id ??
    row.asset_portfolio_id ??
    row.id
  );
}

type AccessAssetGroup = Prisma.PortfolioGetPayload<{
  include: {
    members: true;
    assets: true;
  };
}>;

/**
 * Function normalizeDetails.
 */
function normalizeDetails(value?: string): string | null {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}


/**
 * Function canAccessGroup.
 * Only active members (status = 'active') can access the group.
 */
async function canAccessGroup(groupId: string, accountId: string): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: {
      parentPortfolioId: groupId,
      memberAccountId: accountId,
      status: 'active',
    },
    select: { id: true },
  });

  return Boolean(member);
}

async function canUseRootMode(rootMode?: boolean): Promise<boolean> {
  if (!rootMode) return false;
  const accountId = await getActiveAccountId();
  if (!accountId) return false;
  return isRootUser(accountId);
}


/**
 * Function getAccessAssetGroups.
 */
export async function getAccessAssetGroups() {
  await requireAnyPermission404(['security.third_party.view.self']);
  const canView = await checkPermissions(['security.third_party.view.self']);
  if (!canView) return [];

  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    return await prisma.portfolio.findMany({
      where: {
        members: {
          some: {
            memberAccountId: accountId,
            status: 'active',
          },
        },
      },
      include: {
        _count: {
          select: {
            members: true,
            assets: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  } catch (error) {
    await logError('database', error, 'getAccessAssetGroups');
    return [];
  }
}


/**
 * Function getAccessAssetGroup.
 */
export async function getAccessAssetGroup(groupId: string): Promise<AccessAssetGroup | null> {
  await requireAnyPermission404(['security.third_party.view.self']);
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  try {
    const allowed = await canAccessGroup(groupId, accountId);
    if (!allowed) return null;

    return await prisma.portfolio.findUnique({
      where: { id: groupId },
      include: {
        members: {
          orderBy: {
            memberAccountId: 'asc',
          },
        },
        assets: {
          orderBy: {
            id: 'asc',
          },
        },
      },
    });
  } catch (error) {
    await logError('database', error, `getAccessAssetGroup:${groupId}`);
    return null;
  }
}


/**
 * Function createAssetGroup.
 */
export async function createAssetGroup(input: { name: string; details?: string }) {
  await requireAnyPermission404(['security.third_party.add.self']);
  const canAdd = await checkPermissions(['security.third_party.add.self']);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
  }

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  // Portfolios can only be created by individual accounts.
  const accountType = await getAccountType(accountId);
  if (accountType !== 'individual') {
    return { success: false, error: 'Only individual accounts can create portfolios.' };
  }

  const parsed = createAssetGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.name?.[0] || 'Invalid input.' };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.portfolio.create({
        data: {
          name: parsed.data.name,
          description: normalizeDetails(parsed.data.details),
        },
      });

      await tx.member.create({
        data: {
          parentPortfolioId: group.id,
          accountId,
          isPermanent: true,
          hasFullAccess: true,
          details: {
            isPermanent: true,
            hasFullAccess: true,
          },
        },
      });

      return group;
    });

    revalidatePath('/access');
    revalidatePath(`/access/${created.id}`);

    return { success: true, id: created.id };
  } catch (error) {
    await logError('database', error, 'createAssetGroup');
    return { success: false, error: 'Failed to create asset group.' };
  }
}


/**
 * Function addAssetGroupMember.
 *
 * Invites an account to a portfolio by creating a PortfolioMember row with
 * status 'invited'. The invitation expires 7 days from now (stored in
 * details.expiresOn). Invited members always start with isPermanent: false
 * and hasFullAccess: false — a permanent full-access member can promote them
 * later via updatePortfolioMemberFlags.
 */
export async function addAssetGroupMember(input: {
  groupId: string;
  member: string;
}) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const memberPattern = /^(account:)?[^\s:]+$/;
  if (!input.groupId || !input.member || !memberPattern.test(input.member)) {
    return { success: false, error: 'Invalid member input.' };
  }

  try {
    const allowed = await canAccessGroup(input.groupId, accountId);
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    const normalizedMemberId = input.member.startsWith('account:')
      ? input.member.slice('account:'.length)
      : input.member;

    // Prevent inviting self
    if (normalizedMemberId === accountId) {
      return { success: false, error: 'You cannot invite yourself.' };
    }

    // Prevent duplicate — any existing row (active, invited, or expired)
    const existing = await prisma.member.findFirst({
      where: { parentPortfolioId: input.groupId, accountId: normalizedMemberId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'active') {
        return { success: false, error: 'This account is already a member of the portfolio.' };
      }
      if (existing.status === 'invited') {
        return { success: false, error: 'An invitation has already been sent to this account.' };
      }
      // expired — remove the stale row so a fresh invite can be created
      await prisma.member.delete({ where: { id: existing.id } });
    }

    // Invitation expires 7 days from now
    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + 7);

    await prisma.member.create({
      data: {
        parentPortfolioId: input.groupId,
        accountId: normalizedMemberId,
        status: 'invited',
        isPermanent: false,
        hasFullAccess: false,
        details: {
          isPermanent: false,
          hasFullAccess: false,
          expiresOn: expiresOn.toISOString(),
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/team?portfolio=${input.groupId}`);
    revalidatePath(`/access/role?portfolio=${input.groupId}&member_id=${normalizedMemberId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addAssetGroupMember:${input.groupId}`);
    return { success: false, error: 'Failed to send invitation.' };
  }
}


/**
 * Function updatePortfolioMemberFlags.
 *
 * Updates the isPermanent and hasFullAccess flags on a confirmed portfolio member.
 *
 * Security rules:
 * - The caller must have hasFullAccess: true AND isPermanent: true.
 * - The target member must be a confirmed member (not just invited).
 * - If the member was originally invited and the invitation has expired
 *   (details.expiresOn is in the past), the update is blocked.
 */
export async function updatePortfolioMemberFlags(input: {
  groupId: string;
  memberId: string;
  isPermanent: boolean;
  hasFullAccess: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.groupId || !input.memberId) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    // Caller must be a permanent full-access member
    const callerMember = await prisma.member.findFirst({
      where: { parentPortfolioId: input.groupId, accountId },
      select: { hasFullAccess: true, isPermanent: true },
    });

    if (!callerMember?.hasFullAccess || !callerMember?.isPermanent) {
      return {
        success: false,
        error: 'Only a permanent full-access member can update member flags.',
      };
    }

    // Load the target member
    const member = await prisma.member.findFirst({
      where: { id: input.memberId, parentPortfolioId: input.groupId },
      select: { id: true, accountId: true, status: true, details: true },
    });

    if (!member) {
      return { success: false, error: 'Member not found in this portfolio.' };
    }

    // Expired invitations cannot be updated
    const details = member.details as Record<string, unknown> | null;
    if (member.status === 'expired') {
      return {
        success: false,
        error: 'This invitation has expired and can no longer be updated.',
      };
    }
    // Also check details.expiresOn for invited members in case status hasn't been synced
    if (member.status === 'invited') {
      const expiresOnRaw = details?.expiresOn;
      if (expiresOnRaw) {
        const expiresOn = new Date(expiresOnRaw as string);
        if (!Number.isNaN(expiresOn.getTime()) && expiresOn < new Date()) {
          return {
            success: false,
            error: 'This invitation has expired and can no longer be updated.',
          };
        }
      }
    }

    await prisma.member.update({
      where: { id: member.id },
      data: {
        isPermanent: input.isPermanent,
        hasFullAccess: input.hasFullAccess,
        details: {
          ...(details ?? {}),
          isPermanent: input.isPermanent,
          hasFullAccess: input.hasFullAccess,
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/team?portfolio=${input.groupId}`);
    revalidatePath(`/access/role?portfolio=${input.groupId}&member_id=${member.accountId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updatePortfolioMemberFlags:${input.groupId}:${input.memberId}`);
    return { success: false, error: 'Failed to update member flags.' };
  }
}


/**
 * Function addAssetToGroup.
 */
export async function addAssetToGroup(input: { groupId: string; asset: string; type: string; details?: string }) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const parsed = addAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.asset?.[0] || 'Invalid asset input.' };
  }

  try {
    const allowed = await canAccessGroup(parsed.data.groupId, accountId);
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    // Prevent duplicate assets in the same portfolio
    const existing = await prisma.asset.findFirst({
      where: {
        parent_portfolio_id: parsed.data.groupId,
        OR: [
          { asset_account_id: parsed.data.asset },
          { asset_application_id: parsed.data.asset },
          { asset_connection_id: parsed.data.asset },
          { asset_portfolio_id: parsed.data.asset },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return { success: false, error: 'This asset is already in the portfolio.' };
    }

    await prisma.asset.create({
      data: {
        parent_portfolio_id: parsed.data.groupId,
        asset_account_id: parsed.data.type === 'application' ? null : parsed.data.asset,
        asset_application_id: parsed.data.type === 'application' ? parsed.data.asset : null,
        asset_connection_id: null,
        asset_portfolio_id: null,
        asset_type: toPortfolioAssetType(parsed.data.type),
        details: {
          note: normalizeDetails(parsed.data.details),
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/${parsed.data.groupId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addAssetToGroup:${input.groupId}`);
    return { success: false, error: 'Failed to add asset.' };
  }
}

export async function addAssetToGroupWithMode(
  input: { groupId: string; asset: string; type: string; details?: string },
  options?: { rootMode?: boolean },
) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const parsed = addAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.asset?.[0] || 'Invalid asset input.' };
  }

  try {
    const rootOverride = await canUseRootMode(options?.rootMode);
    const allowed = rootOverride || (await canAccessGroup(parsed.data.groupId, accountId));
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    const existing = await prisma.asset.findFirst({
      where: {
        parent_portfolio_id: parsed.data.groupId,
        OR: [
          { asset_account_id: parsed.data.asset },
          { asset_application_id: parsed.data.asset },
          { asset_connection_id: parsed.data.asset },
          { asset_portfolio_id: parsed.data.asset },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return { success: false, error: 'This asset is already in the portfolio.' };
    }

    await prisma.asset.create({
      data: {
        parent_portfolio_id: parsed.data.groupId,
        asset_account_id: parsed.data.type === 'application' ? null : parsed.data.asset,
        asset_application_id: parsed.data.type === 'application' ? parsed.data.asset : null,
        asset_connection_id: null,
        asset_portfolio_id: null,
        asset_type: toPortfolioAssetType(parsed.data.type),
        details: {
          note: normalizeDetails(parsed.data.details),
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/${parsed.data.groupId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `addAssetToGroup:${input.groupId}`);
    return { success: false, error: 'Failed to add asset.' };
  }
}


/**
 * Function removeAssetFromGroup.
 *
 * Removes an asset from a portfolio and cleans up all access grants scoped to
 * that asset within the portfolio. The asset is then re-attached to a personal
 * portfolio owned solely by the caller so it is not lost.
 */
export async function removeAssetFromGroup(input: { groupId: string; portfolioAssetId: string }) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.groupId || !input.portfolioAssetId) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    const allowed = await canAccessGroup(input.groupId, accountId);
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    // Load the asset row so we know assetId and assetType for re-attachment
    const assetRow = await prisma.asset.findFirst({
      where: {
        id: input.portfolioAssetId,
        parent_portfolio_id: input.groupId,
      },
      select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
    });

    if (!assetRow) {
      return { success: false, error: 'Asset not found in this portfolio.' };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Remove all access grants scoped to this asset in this portfolio
      await tx.authzAssetsAccessGrant.deleteMany({
        where: {
          asset_id: assetRow.id,
          portfolio_id: input.groupId,
        },
      });

      // 2. Remove the asset from the portfolio
      await tx.asset.delete({
        where: { id: assetRow.id },
      });

      // 3. Re-attach the asset to the caller's personal portfolio.
      //    Find or create a personal portfolio owned solely by this account.
      let personalPortfolio = await tx.portfolio.findFirst({
        where: {
          members: {
            every: { accountId },
            some: { accountId },
          },
        },
        select: { id: true },
      });

      if (!personalPortfolio) {
        personalPortfolio = await tx.portfolio.create({
          data: {
            name: 'My Assets',
            description: 'Personal asset portfolio.',
            members: {
              create: {
                accountId,
                isPermanent: true,
                hasFullAccess: true,
                details: {
                  isPermanent: true,
                  hasFullAccess: true,
                },
              },
            },
          },
          select: { id: true },
        });
      }

      // Only add if not already present in the personal portfolio
      const alreadyInPersonal = await tx.asset.findFirst({
        where: {
          parent_portfolio_id: personalPortfolio.id,
          OR: [
            { asset_account_id: toLogicalAssetId(assetRow) },
            { asset_application_id: toLogicalAssetId(assetRow) },
            { asset_connection_id: toLogicalAssetId(assetRow) },
            { asset_portfolio_id: toLogicalAssetId(assetRow) },
          ],
        },
        select: { id: true },
      });

      if (!alreadyInPersonal) {
        await tx.asset.create({
          data: {
            parent_portfolio_id: personalPortfolio.id,
            asset_account_id: assetRow.asset_account_id,
            asset_application_id: assetRow.asset_application_id,
            asset_connection_id: assetRow.asset_connection_id,
            asset_portfolio_id: assetRow.asset_portfolio_id,
            asset_type: assetRow.asset_type,
          },
        });
      }
    });

    revalidatePath('/access');
    revalidatePath(`/access/portfolio/${input.groupId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeAssetFromGroup:${input.groupId}:${input.portfolioAssetId}`);
    return { success: false, error: 'Failed to remove asset.' };
  }
}

export async function removeAssetFromGroupWithMode(
  input: { groupId: string; portfolioAssetId: string },
  options?: { rootMode?: boolean },
) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.groupId || !input.portfolioAssetId) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    const rootOverride = await canUseRootMode(options?.rootMode);
    const allowed = rootOverride || (await canAccessGroup(input.groupId, accountId));
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    const assetRow = await prisma.asset.findFirst({
      where: {
        id: input.portfolioAssetId,
        parent_portfolio_id: input.groupId,
      },
      select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
    });

    if (!assetRow) {
      return { success: false, error: 'Asset not found in this portfolio.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.authzAssetsAccessGrant.deleteMany({
        where: {
          asset_id: assetRow.id,
          portfolio_id: input.groupId,
        },
      });

      await tx.asset.delete({
        where: { id: assetRow.id },
      });

      let personalPortfolio = await tx.portfolio.findFirst({
        where: {
          members: {
            every: { accountId },
            some: { accountId },
          },
        },
        select: { id: true },
      });

      if (!personalPortfolio) {
        personalPortfolio = await tx.portfolio.create({
          data: {
            name: 'My Assets',
            description: 'Personal asset portfolio.',
            members: {
              create: {
                accountId,
                isPermanent: true,
                hasFullAccess: true,
                details: {
                  isPermanent: true,
                  hasFullAccess: true,
                },
              },
            },
          },
          select: { id: true },
        });
      }

      const alreadyInPersonal = await tx.asset.findFirst({
        where: {
          parent_portfolio_id: personalPortfolio.id,
          OR: [
            { asset_account_id: toLogicalAssetId(assetRow) },
            { asset_application_id: toLogicalAssetId(assetRow) },
            { asset_connection_id: toLogicalAssetId(assetRow) },
            { asset_portfolio_id: toLogicalAssetId(assetRow) },
          ],
        },
        select: { id: true },
      });

      if (!alreadyInPersonal) {
        await tx.asset.create({
          data: {
            parent_portfolio_id: personalPortfolio.id,
            asset_account_id: assetRow.asset_account_id,
            asset_application_id: assetRow.asset_application_id,
            asset_connection_id: assetRow.asset_connection_id,
            asset_portfolio_id: assetRow.asset_portfolio_id,
            asset_type: assetRow.asset_type,
          },
        });
      }
    });

    revalidatePath('/access');
    revalidatePath(`/access/portfolio/${input.groupId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeAssetFromGroup:${input.groupId}:${input.portfolioAssetId}`);
    return { success: false, error: 'Failed to remove asset.' };
  }
}


/**
 * Function removeAssetGroupMember.
 *
 * Removes a member from a portfolio and cleans up all access grants they held
 * on assets within that portfolio.
 *
 * Security rules:
 * 1. Only a member with hasFullAccess AND isPermanent can remove another member
 *    who also has hasFullAccess AND isPermanent.
 * 2. A user removing themselves is only allowed if at least one other member
 *    in the portfolio has hasFullAccess AND isPermanent (so the portfolio is
 *    never left without a permanent full-access owner).
 */
export async function removeAssetGroupMember(input: {
  groupId: string;
  memberId: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.groupId || !input.memberId) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    const allowed = await canAccessGroup(input.groupId, accountId);
    if (!allowed) {
      return { success: false, error: 'Permission denied.' };
    }

    // Load the target member and the caller's own membership in one query.
    const [member, callerMember] = await Promise.all([
      prisma.member.findFirst({
        where: { id: input.memberId, parentPortfolioId: input.groupId },
        select: { id: true, accountId: true, hasFullAccess: true, isPermanent: true, status: true },
      }),
      prisma.member.findFirst({
        where: { parentPortfolioId: input.groupId, accountId, status: 'active' },
        select: { hasFullAccess: true, isPermanent: true },
      }),
    ]);

    if (!member) {
      return { success: false, error: 'Member not found in this portfolio.' };
    }

    // Invited members can be removed (invitation cancelled) without further checks.
    if (member.status === 'invited') {
      await prisma.member.delete({ where: { id: member.id } });
      revalidatePath('/access');
      revalidatePath(`/access/team?portfolio=${input.groupId}`);
      revalidatePath(`/access/role?portfolio=${input.groupId}&member_id=${member.accountId}`);
      return { success: true };
    }

    const targetIsPermanentOwner = member.hasFullAccess && member.isPermanent;
    const isSelfRemoval = member.accountId === accountId;

    // Rule 1: removing a permanent full-access member requires the caller to
    // also be a permanent full-access member.
    if (targetIsPermanentOwner) {
      const callerIsPermanentOwner = callerMember?.hasFullAccess && callerMember?.isPermanent;
      if (!callerIsPermanentOwner) {
        return {
          success: false,
          error: 'Only a permanent full-access member can remove another permanent full-access member.',
        };
      }
    }

    // Rule 2: self-removal is only allowed when at least one other member
    // retains hasFullAccess AND isPermanent.
    if (isSelfRemoval) {
      const otherPermanentOwnerCount = await prisma.member.count({
        where: {
          parentPortfolioId: input.groupId,
          hasFullAccess: true,
          isPermanent: true,
          status: 'active',
          accountId: { not: accountId },
        },
      });

      if (otherPermanentOwnerCount === 0) {
        return {
          success: false,
          error:
            'You cannot leave the portfolio because there is no other permanent full-access member. Transfer ownership first.',
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Remove all access grants for this member in this portfolio
      await tx.authzAssetsAccessGrant.deleteMany({
        where: {
          account_id: member.accountId,
          portfolio_id: input.groupId,
          app_id: ACCESS_APP_ID,
        },
      });

      // Remove the member from the portfolio
      await tx.member.delete({
        where: { id: member.id },
      });
    });

    revalidatePath('/access');
    revalidatePath(`/access/portfolio/${input.groupId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `removeAssetGroupMember:${input.groupId}:${input.memberId}`);
    return { success: false, error: 'Failed to remove member.' };
  }
}


/**
 * Function assignAssetMemberRole.
 */
export async function assignAssetMemberRole(input: {
  groupId?: string;
  assetMember: string;
  asset: string;
  role: string;
}, options?: { rootMode?: boolean }) {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.assetMember || !input.asset || !input.role) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    const groupId = input.groupId?.trim() || null;
    const rootOverride = await canUseRootMode(options?.rootMode);
    if (groupId) {
      const allowed = rootOverride || (await canAccessGroup(groupId, accountId));
      if (!allowed) {
        return { success: false, error: 'Permission denied.' };
      }
    } else if (!rootOverride) {
      // Direct (non-portfolio) asset assignment is root-mode only.
      return { success: false, error: 'Permission denied.' };
    }

    const member = groupId
      ? await prisma.member.findFirst({
          where: {
            id: input.assetMember,
            parentPortfolioId: groupId,
          },
          select: { id: true, accountId: true },
        })
      : await prisma.account.findUnique({
          where: { id: input.assetMember },
          select: { id: true },
        }).then((a) => (a ? { id: a.id, accountId: a.id } : null));

    if (!member) {
      return { success: false, error: groupId ? 'Member not found in this group.' : 'Account not found.' };
    }

    if (!groupId) {
      // Direct assignment is allowed only when this asset is not shared via
      // any portfolio that includes accounts other than the current actor.
      const directAsset = await prisma.asset.findUnique({
        where: { id: input.asset },
        select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
      });
      if (!directAsset) {
        return { success: false, error: 'Asset not found.' };
      }

      const sharedAsset = await prisma.asset.findFirst({
        where: {
          OR: [
            { asset_account_id: toLogicalAssetId(directAsset) },
            { asset_application_id: toLogicalAssetId(directAsset) },
            { asset_connection_id: toLogicalAssetId(directAsset) },
            { asset_portfolio_id: toLogicalAssetId(directAsset) },
          ],
          asset_type: directAsset.asset_type,
          portfolio: {
            members: {
              some: {
                accountId: { not: accountId },
                status: 'active',
              },
            },
          },
        },
        select: { id: true },
      });

      if (sharedAsset) {
        return {
          success: false,
          error: 'This asset is in a portfolio. Assign access through portfolio members only.',
        };
      }
    }

    // Find or create the asset access grant
    const existing = await prisma.authzAssetsAccessGrant.findFirst({
      where: {
        asset_id: input.asset,
        account_id: member.accountId,
        role_id: input.role,
        portfolio_id: groupId,
        app_id: ACCESS_APP_ID,
      },
    });

    if (!existing) {
      await prisma.authzAssetsAccessGrant.create({
        data: {
          asset_id: input.asset,
          account_id: member.accountId,
          role_id: input.role,
          portfolio_id: groupId,
          app_id: ACCESS_APP_ID,
        },
      });
    }

    if (groupId) {
      revalidatePath(`/access/${groupId}`);
    }
    revalidatePath('/access/asset');
    return { success: true };
  } catch (error) {
    await logError('database', error, `assignAssetMemberRole:${input.groupId ?? 'direct'}`);
    return { success: false, error: 'Failed to assign role.' };
  }
}


/**
 * Type AssetRole — a role available for a specific asset type.
 */
export type AssetRole = {
  id: string;
  name: string;
  description?: string;
};

// Maps asset.assetType values to the authzRole.scope used in the seeder.
const ASSET_TYPE_TO_ROLE_SCOPE: Record<string, string> = {
  app_in_port:          'application',
  app_in_acc:           'application',
  acc_in_port:          'account',
  acc_in_acc:           'account',
  conn_in_port:         'connection',
  conn_in_acc:          'connection',
  port_in_acc:          'portfolio',
  // legacy aliases
  application:          'application',
  app:                  'application',
  'account.individual': 'account',
  'account.brand':      'account',
  'account.branch':     'account',
  'account.dependent':  'account',
  brand_account:        'account',
  branch_account:       'account',
};

/**
 * Function getRolesForAsset.
 *
 * Given a portfolioAsset row ID, resolves the asset type and returns all
 * AuthzRole rows whose scope matches that asset type within neup.account.
 *
 * Roles are scoped by asset TYPE, not by the specific asset instance —
 * e.g. all application assets share the same set of application-scoped roles.
 */
export async function getRolesForAsset(portfolioAssetId: string): Promise<AssetRole[]> {
  if (!portfolioAssetId) return [];

  try {
    const assetRow = await prisma.asset.findUnique({
      where: { id: portfolioAssetId },
      select: { asset_type: true },
    });

    if (!assetRow) return [];

    const type = assetRow.asset_type.trim().toLowerCase();
    const roleScope = ASSET_TYPE_TO_ROLE_SCOPE[type];

    if (!roleScope) return [];

    const roles = await prisma.authzRole.findMany({
      where: {
        appId: 'neup.account',
        scope: roleScope,
      },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
    }));
  } catch (error) {
    await logError('database', error, `getRolesForAsset:${portfolioAssetId}`);
    return [];
  }
}


/**
 * Function getRolesForAssetType.
 *
 * Returns all AuthzRole rows for a given asset type string (e.g. 'application', 'brand_account').
 * Used by the permission wizard to show available roles before assets are added to the portfolio.
 */
export async function getRolesForAssetType(assetType: string): Promise<AssetRole[]> {
  if (!assetType) return [];

  try {
    const type = assetType.trim().toLowerCase();
    const roleScope = ASSET_TYPE_TO_ROLE_SCOPE[type];

    if (!roleScope) return [];

    const roles = await prisma.authzRole.findMany({
      where: {
        appId: 'neup.account',
        scope: roleScope,
      },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
    }));
  } catch (error) {
    await logError('database', error, `getRolesForAssetType:${assetType}`);
    return [];
  }
}


/**
 * Function bulkAssignAssetRoles.
 *
 * Assigns multiple roles to a member across multiple assets in a single operation.
 * Used by the permission wizard after the user confirms their selections.
 */
export async function bulkAssignAssetRoles(input: {
  groupId?: string;
  memberId: string;
  assetIds: string[];
  assetType: string;
  roleIds: string[];
}, options?: { rootMode?: boolean }): Promise<{ success: boolean; error?: string; assigned?: number }> {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!input.memberId || !input.assetIds.length || !input.roleIds.length) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    const groupId = input.groupId?.trim() || null;
    const rootOverride = await canUseRootMode(options?.rootMode);
    if (groupId) {
      const allowed = rootOverride || (await canAccessGroup(groupId, accountId));
      if (!allowed) {
        return { success: false, error: 'Permission denied.' };
      }
    } else if (!rootOverride) {
      return { success: false, error: 'Permission denied.' };
    }

    const member = groupId
      ? await prisma.member.findFirst({
          where: {
            id: input.memberId,
            parentPortfolioId: groupId,
          },
          select: { id: true, accountId: true },
        })
      : await prisma.account.findUnique({
          where: { id: input.memberId },
          select: { id: true },
        }).then((a) => (a ? { id: a.id, accountId: a.id } : null));

    if (!member) {
      return { success: false, error: groupId ? 'Member not found in this group.' : 'Account not found.' };
    }

    if (!groupId) {
      const directAssets = await prisma.asset.findMany({
        where: { id: { in: input.assetIds } },
        select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
      });

      if (directAssets.length !== input.assetIds.length) {
        return { success: false, error: 'One or more assets were not found.' };
      }

      for (const asset of directAssets) {
        const sharedAsset = await prisma.asset.findFirst({
          where: {
            OR: [
              { asset_account_id: toLogicalAssetId(asset) },
              { asset_application_id: toLogicalAssetId(asset) },
              { asset_connection_id: toLogicalAssetId(asset) },
              { asset_portfolio_id: toLogicalAssetId(asset) },
            ],
            asset_type: asset.asset_type,
            portfolio: {
              members: {
                some: {
                  accountId: { not: accountId },
                  status: 'active',
                },
              },
            },
          },
          select: { id: true },
        });
        if (sharedAsset) {
          return {
            success: false,
            error: 'One or more assets are in a portfolio. Assign access through portfolio members only.',
          };
        }
      }
    }

    // First, ensure all assets are resolvable to portfolio asset rows.
    const existingAssets = groupId
      ? await prisma.asset.findMany({
          where: {
            parent_portfolio_id: groupId,
            OR: [
              { asset_account_id: { in: input.assetIds } },
              { asset_application_id: { in: input.assetIds } },
              { asset_connection_id: { in: input.assetIds } },
              { asset_portfolio_id: { in: input.assetIds } },
            ],
          },
          select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
        })
      : await prisma.asset.findMany({
          where: {
            OR: [
              { asset_account_id: { in: input.assetIds } },
              { asset_application_id: { in: input.assetIds } },
              { asset_connection_id: { in: input.assetIds } },
              { asset_portfolio_id: { in: input.assetIds } },
            ],
            asset_type: toPortfolioAssetType(input.assetType),
          },
          select: { id: true, asset_account_id: true, asset_application_id: true, asset_connection_id: true, asset_portfolio_id: true, asset_type: true },
          orderBy: { id: 'asc' },
        });

    const existingAssetIdMap = new Map(existingAssets.map((a) => [toLogicalAssetId(a), a.id]));
    const portfolioAssetIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      // Add missing assets to the portfolio only in portfolio mode.
      for (const rawAssetId of input.assetIds) {
        if (existingAssetIdMap.has(rawAssetId)) {
          portfolioAssetIds.push(existingAssetIdMap.get(rawAssetId)!);
        } else if (groupId) {
          const created = await tx.asset.create({
            data: {
              parent_portfolio_id: groupId,
              asset_account_id: input.assetType === 'application' ? null : rawAssetId,
              asset_application_id: input.assetType === 'application' ? rawAssetId : null,
              asset_connection_id: null,
              asset_portfolio_id: null,
              asset_type: toPortfolioAssetType(input.assetType),
            },
            select: { id: true },
          });
          portfolioAssetIds.push(created.id);
        } else {
          return;
        }
      }

      // For each asset, update the grants: remove old roles, add new roles
      for (const portfolioAssetId of portfolioAssetIds) {
        // Remove all existing grants for this member on this asset in this portfolio
        await tx.authzAssetsAccessGrant.deleteMany({
          where: {
            asset_id: portfolioAssetId,
            account_id: member.accountId,
            portfolio_id: groupId,
            app_id: ACCESS_APP_ID,
          },
        });

        // Add the new role grants
        for (const roleId of input.roleIds) {
          await tx.authzAssetsAccessGrant.create({
            data: {
              asset_id: portfolioAssetId,
              account_id: member.accountId,
              role_id: roleId,
              portfolio_id: groupId,
              app_id: ACCESS_APP_ID,
            },
          });
        }
      }
    });

    const totalAssigned = portfolioAssetIds.length * input.roleIds.length;

    revalidatePath('/access');
    if (groupId) {
      revalidatePath(`/access/portfolio/${groupId}`);
    }
    return { success: true, assigned: totalAssigned };
  } catch (error) {
    await logError('database', error, `bulkAssignAssetRoles:${input.groupId ?? 'direct'}`);
    return { success: false, error: 'Failed to assign permissions.' };
  }
}


/**
 * Type MemberAssetGrant - represents existing grants for a member on an asset.
 */
export type MemberAssetGrant = {
  portfolioAssetId: string;
  assetId: string;
  assetName: string;
  assetType: string;
  roleIds: string[];
};

/**
 * Function getMemberAssetGrants.
 *
 * Returns all assets in the portfolio that the given member has access to,
 * along with the roles they hold on each asset.
 */
export async function getMemberAssetGrants(
  groupId: string,
  memberId: string,
): Promise<MemberAssetGrant[]> {
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    const allowed = await canAccessGroup(groupId, accountId);
    if (!allowed) return [];

    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        parentPortfolioId: groupId,
      },
      select: { id: true, accountId: true },
    });

    if (!member) return [];

    // Get all grants for this member in this portfolio
    const grants = await prisma.authzAssetsAccessGrant.findMany({
      where: {
        account_id: member.accountId,
        portfolio_id: groupId,
        app_id: ACCESS_APP_ID,
      },
      select: {
        asset_id: true,
        role_id: true,
        asset: {
          select: {
            id: true,
            asset_account_id: true,
            asset_application_id: true,
            asset_connection_id: true,
            asset_portfolio_id: true,
            asset_type: true,
          },
        },
      },
    });

    // Group by asset
    const assetMap = new Map<string, { portfolioAssetId: string; assetId: string; assetType: string; roleIds: string[] }>();

    for (const grant of grants) {
      const key = grant.asset_id;
      if (!assetMap.has(key)) {
        const assetId = toLogicalAssetId(grant.asset);
        assetMap.set(key, {
          portfolioAssetId: grant.asset.id,
          assetId,
          assetType: grant.asset.asset_type,
          roleIds: [],
        });
      }
      assetMap.get(key)!.roleIds.push(grant.role_id);
    }

    // Resolve asset names
    const results = await Promise.all(
      Array.from(assetMap.values()).map(async (item) => {
        const resolved = await resolveAssetName(item.assetId, item.assetType);
        return {
          portfolioAssetId: item.portfolioAssetId,
          assetId: item.assetId,
          assetName: resolved.name,
          assetType: item.assetType,
          roleIds: item.roleIds,
        };
      })
    );

    return results;
  } catch (error) {
    await logError('database', error, `getMemberAssetGrants:${groupId}:${memberId}`);
    return [];
  }
}
