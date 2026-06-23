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
import {
  ACCESS_APPLICATION_ADD_PERMISSIONS,
  ACCESS_APPLICATION_REMOVE_PERMISSIONS,
  ACCESS_CONNECTION_ADD_PERMISSIONS,
  ACCESS_CONNECTION_REMOVE_PERMISSIONS,
  ACCESS_LINKED_ACCOUNT_ADD_PERMISSIONS,
  ACCESS_LINKED_ACCOUNT_REMOVE_PERMISSIONS,
  ACCESS_PORTFOLIO_CREATE_PERMISSIONS,
  ACCESS_TEAM_ADD_PERMISSIONS,
  ACCESS_TEAM_REMOVE_PERMISSIONS,
  ACCESS_VIEW_PERMISSIONS,
} from '@/core/auth/access-view-permissions';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import { canAssignRoleScopeToAccount, expectedRoleScopeForAccount } from '@/services/role-scopes';

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

function portfolioAssetChildData(type: string, assetId: string) {
  const normalized = type.trim().toLowerCase();
  return {
    member_account_id: normalized === 'application' ? null : assetId,
    access_application_id: normalized === 'application' ? assetId : null,
    member_connection_id: null,
    member_portfolio_id: null,
  };
}

function toLogicalAssetId(row: {
  id: string;
  member_account_id?: string | null;
  access_application_id?: string | null;
  member_connection_id?: string | null;
  member_portfolio_id?: string | null;
}): string {
  return (
    row.member_account_id ??
    row.access_application_id ??
    row.member_connection_id ??
    row.member_portfolio_id ??
    row.id
  );
}

function assetChildRef(row: {
  member_account_id?: string | null;
  access_application_id?: string | null;
  member_connection_id?: string | null;
  member_portfolio_id?: string | null;
}) {
  if (row.member_account_id) return { childAccountId: row.member_account_id };
  if (row.access_application_id) return { childApplicationId: row.access_application_id };
  if (row.member_connection_id) return { childConnectionId: row.member_connection_id };
  if (row.member_portfolio_id) return { childPortfolioId: row.member_portfolio_id };
  return null;
}

function memberFlags(member: { details?: unknown; isTemporary?: Date | null }) {
  const details = member.details && typeof member.details === 'object' && !Array.isArray(member.details)
    ? member.details as Record<string, unknown>
    : {};
  return {
    isPermanent: member.isTemporary == null || details.isPermanent === true,
    hasFullAccess: details.hasFullAccess === true || details.accessLevel === 'full',
  };
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

async function hasAnyPermission(permissions: readonly string[]): Promise<boolean> {
  return checkPermissions([...permissions]);
}

function permissionSetForAssetType(
  type: string,
  action: 'add' | 'remove',
): readonly string[] {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'application' || normalized === 'app_in_port') {
    return action === 'add'
      ? ACCESS_APPLICATION_ADD_PERMISSIONS
      : ACCESS_APPLICATION_REMOVE_PERMISSIONS;
  }
  if (normalized === 'brand_account' || normalized === 'branch_account' || normalized === 'acc_in_port') {
    return action === 'add'
      ? ACCESS_LINKED_ACCOUNT_ADD_PERMISSIONS
      : ACCESS_LINKED_ACCOUNT_REMOVE_PERMISSIONS;
  }
  return action === 'add'
    ? ACCESS_CONNECTION_ADD_PERMISSIONS
    : ACCESS_CONNECTION_REMOVE_PERMISSIONS;
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
      OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
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
  await requireAnyPermission404(ACCESS_VIEW_PERMISSIONS);

  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  try {
    await cleanupExpiredAccessModel();

    return await prisma.portfolio.findMany({
      where: {
        members: {
          some: {
            memberAccountId: accountId,
            status: 'active',
            OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
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
  await requireAnyPermission404(ACCESS_VIEW_PERMISSIONS);
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
  await requireAnyPermission404([...ACCESS_PORTFOLIO_CREATE_PERMISSIONS]);
  const canAdd = await hasAnyPermission(ACCESS_PORTFOLIO_CREATE_PERMISSIONS);
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
          memberType: 'acc_in_port',
          parentPortfolioId: group.id,
          memberAccountId: accountId,
          status: 'active',
          isTemporary: null,
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

  const canAdd = await hasAnyPermission(ACCESS_TEAM_ADD_PERMISSIONS);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
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

    const targetAccount = await prisma.account.findUnique({
      where: { id: normalizedMemberId },
      select: { accountType: true },
    });
    if (!targetAccount) {
      return { success: false, error: 'Account not found.' };
    }
    if (targetAccount.accountType !== 'individual') {
      return { success: false, error: 'Only individual accounts can be invited to a team.' };
    }

    // Prevent duplicate — any existing row (active, invited, or expired)
    const existing = await prisma.member.findFirst({
      where: { parentPortfolioId: input.groupId, memberAccountId: normalizedMemberId },
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

    await prisma.$transaction(async (tx) => {
      await tx.member.create({
        data: {
          memberType: 'acc_in_port',
          parentPortfolioId: input.groupId,
          memberAccountId: normalizedMemberId,
          status: 'invited',
          isTemporary: expiresOn,
          details: {
            isPermanent: false,
            hasFullAccess: false,
            expiresOn: expiresOn.toISOString(),
          },
        },
      });
      const request = await tx.request.create({
        data: {
          action: 'access_invitation',
          senderId: accountId,
          recipientId: normalizedMemberId,
          status: 'pending',
          data: {
            parentPortfolioId: input.groupId,
            expiresOn: expiresOn.toISOString(),
          },
        },
      });
      await tx.notification.create({
        data: {
          accountId: normalizedMemberId,
          action: 'access_invitation',
          title: 'Team Invitation',
          message: 'You have received a team invitation.',
          type: 'info',
          read: false,
          deletableOn: expiresOn,
          detail: { requestId: request.id },
        },
      });
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

  const canAdd = await hasAnyPermission(ACCESS_TEAM_ADD_PERMISSIONS);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
  }

  if (!input.groupId || !input.memberId) {
    return { success: false, error: 'Missing required fields.' };
  }

  try {
    // Caller must be a permanent full-access member
    const callerMember = await prisma.member.findFirst({
      where: { parentPortfolioId: input.groupId, memberAccountId: accountId },
      select: { details: true, isTemporary: true },
    });

    const callerFlags = callerMember ? memberFlags(callerMember) : null;
    if (!callerFlags?.hasFullAccess || !callerFlags?.isPermanent) {
      return {
        success: false,
        error: 'Only a permanent full-access member can update member flags.',
      };
    }

    // Load the target member
    const member = await prisma.member.findFirst({
      where: { id: input.memberId, parentPortfolioId: input.groupId },
      select: { id: true, memberAccountId: true, status: true, details: true },
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
        isTemporary: input.isPermanent ? null : undefined,
        details: {
          ...(details ?? {}),
          isPermanent: input.isPermanent,
          hasFullAccess: input.hasFullAccess,
        },
      },
    });

    revalidatePath('/access');
    revalidatePath(`/access/team?portfolio=${input.groupId}`);
    revalidatePath(`/access/role?portfolio=${input.groupId}&member_id=${member.memberAccountId}`);
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

  const canAdd = await hasAnyPermission(permissionSetForAssetType(input.type, 'add'));
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
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
          { member_account_id: parsed.data.asset },
          { access_application_id: parsed.data.asset },
          { member_connection_id: parsed.data.asset },
          { member_portfolio_id: parsed.data.asset },
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
        ...portfolioAssetChildData(parsed.data.type, parsed.data.asset),
        access_type: toPortfolioAssetType(parsed.data.type),
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

  const canAdd = await hasAnyPermission(permissionSetForAssetType(input.type, 'add'));
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
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
          { member_account_id: parsed.data.asset },
          { access_application_id: parsed.data.asset },
          { member_connection_id: parsed.data.asset },
          { member_portfolio_id: parsed.data.asset },
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
        ...portfolioAssetChildData(parsed.data.type, parsed.data.asset),
        access_type: toPortfolioAssetType(parsed.data.type),
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

    const assetRow = await prisma.asset.findFirst({
      where: {
        id: input.portfolioAssetId,
        parent_portfolio_id: input.groupId,
      },
      select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
    });

    if (!assetRow) {
      return { success: false, error: 'Asset not found in this portfolio.' };
    }

    const canRemove = await hasAnyPermission(permissionSetForAssetType(assetRow.access_type, 'remove'));
    if (!canRemove) {
      return { success: false, error: 'Permission denied.' };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Remove all access grants scoped to this asset in this portfolio
      await tx.access.deleteMany({
        where: {
          assetId: assetRow.id,
          parentPortfolioId: input.groupId,
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
            every: { memberAccountId: accountId },
            some: { memberAccountId: accountId },
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
                memberType: 'acc_in_port',
                memberAccountId: accountId,
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
            { member_account_id: toLogicalAssetId(assetRow) },
            { access_application_id: toLogicalAssetId(assetRow) },
            { member_connection_id: toLogicalAssetId(assetRow) },
            { member_portfolio_id: toLogicalAssetId(assetRow) },
          ],
        },
        select: { id: true },
      });

      if (!alreadyInPersonal) {
        await tx.asset.create({
          data: {
            parent_portfolio_id: personalPortfolio.id,
            member_account_id: assetRow.member_account_id,
            access_application_id: assetRow.access_application_id,
            member_connection_id: assetRow.member_connection_id,
            member_portfolio_id: assetRow.member_portfolio_id,
            access_type: assetRow.access_type,
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
      select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
    });

    if (!assetRow) {
      return { success: false, error: 'Asset not found in this portfolio.' };
    }

    const canRemove = await hasAnyPermission(permissionSetForAssetType(assetRow.access_type, 'remove'));
    if (!canRemove) {
      return { success: false, error: 'Permission denied.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.access.deleteMany({
        where: {
          assetId: assetRow.id,
          parentPortfolioId: input.groupId,
        },
      });

      await tx.asset.delete({
        where: { id: assetRow.id },
      });

      let personalPortfolio = await tx.portfolio.findFirst({
        where: {
          members: {
            every: { memberAccountId: accountId },
            some: { memberAccountId: accountId },
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
                memberType: 'acc_in_port',
                memberAccountId: accountId,
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
            { member_account_id: toLogicalAssetId(assetRow) },
            { access_application_id: toLogicalAssetId(assetRow) },
            { member_connection_id: toLogicalAssetId(assetRow) },
            { member_portfolio_id: toLogicalAssetId(assetRow) },
          ],
        },
        select: { id: true },
      });

      if (!alreadyInPersonal) {
        await tx.asset.create({
          data: {
            parent_portfolio_id: personalPortfolio.id,
            member_account_id: assetRow.member_account_id,
            access_application_id: assetRow.access_application_id,
            member_connection_id: assetRow.member_connection_id,
            member_portfolio_id: assetRow.member_portfolio_id,
            access_type: assetRow.access_type,
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

  const canRemove = await hasAnyPermission(ACCESS_TEAM_REMOVE_PERMISSIONS);
  if (!canRemove) {
    return { success: false, error: 'Permission denied.' };
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
        select: { id: true, memberAccountId: true, details: true, isTemporary: true, status: true },
      }),
      prisma.member.findFirst({
        where: { parentPortfolioId: input.groupId, memberAccountId: accountId, status: 'active' },
        select: { details: true, isTemporary: true },
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
      revalidatePath(`/access/role?portfolio=${input.groupId}&member_id=${member.memberAccountId}`);
      return { success: true };
    }

    const targetFlags = memberFlags(member);
    const callerFlags = callerMember ? memberFlags(callerMember) : null;
    const targetIsPermanentOwner = targetFlags.hasFullAccess && targetFlags.isPermanent;
    const isSelfRemoval = member.memberAccountId === accountId;

    // Rule 1: removing a permanent full-access member requires the caller to
    // also be a permanent full-access member.
    if (targetIsPermanentOwner) {
      const callerIsPermanentOwner = callerFlags?.hasFullAccess && callerFlags?.isPermanent;
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
          status: 'active',
          memberAccountId: { not: accountId },
          OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
          details: {
            path: ['hasFullAccess'],
            equals: true,
          },
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
      await tx.access.deleteMany({
        where: {
          memberAccountId: member.memberAccountId,
          parentPortfolioId: input.groupId,
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

  const canAdd = await hasAnyPermission(ACCESS_TEAM_ADD_PERMISSIONS);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
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
            status: 'active',
          },
          select: { id: true, memberAccountId: true },
        })
      : await prisma.account.findUnique({
          where: { id: input.assetMember },
          select: { id: true },
        }).then((a) => (a ? { id: a.id, memberAccountId: a.id } : null));

    if (!member) {
      return { success: false, error: groupId ? 'Member not found in this group.' : 'Account not found.' };
    }

    const assetRow = await prisma.asset.findUnique({
      where: { id: input.asset },
      select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
    });
    if (!assetRow) {
      return { success: false, error: 'Asset not found.' };
    }

    if (!groupId) {
      // Direct assignment is allowed only when this asset is not shared via
      // any portfolio that includes accounts other than the current actor.
      const sharedAsset = await prisma.asset.findFirst({
        where: {
          OR: [
            { member_account_id: toLogicalAssetId(assetRow) },
            { access_application_id: toLogicalAssetId(assetRow) },
            { member_connection_id: toLogicalAssetId(assetRow) },
            { member_portfolio_id: toLogicalAssetId(assetRow) },
          ],
          access_type: assetRow.access_type,
          parentPortfolio: {
            members: {
              some: {
                memberAccountId: { not: accountId },
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

    const childRef = assetChildRef(assetRow);
    if (!childRef) {
      return { success: false, error: 'Asset does not have a valid child reference.' };
    }

    if (assetRow.member_account_id) {
      const [targetAccount, role] = await Promise.all([
        prisma.account.findUnique({
          where: { id: assetRow.member_account_id },
          select: { accountType: true },
        }),
        prisma.authzRole.findUnique({
          where: { id: input.role },
          select: { scope: true },
        }),
      ]);
      if (!targetAccount || !role || !canAssignRoleScopeToAccount(role.scope, targetAccount.accountType, ['manageable'])) {
        return { success: false, error: 'This role scope cannot be assigned to this asset account type.' };
      }
    }

    await ensureAccessGrant(prisma, {
      memberAccountId: member.memberAccountId,
      ...(groupId ? { parentPortfolioId: groupId } : { parentAccountId: accountId }),
      ...childRef,
      accessApplicationId: ACCESS_APP_ID,
      roleId: input.role,
    } as Parameters<typeof ensureAccessGrant>[1]);

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

// Maps asset.assetType values to the authzRole.scope used for non-account assets.
const ASSET_TYPE_TO_ROLE_SCOPE: Record<string, string> = {
  app_in_port:          '',
  app_in_acc:           '',
  acc_in_port:          'acMgmt.self',
  acc_in_acc:           'acMgmt.self',
  conn_in_port:         'connection',
  conn_in_acc:          'connection',
  port_in_acc:          'portfolio',
  // legacy aliases
  application:          '',
  app:                  '',
  'account.individual': 'acMgmt.self',
  'account.brand':      'acMgmt.brand',
  'account.branch':     'acMgmt.branch',
  'account.dependent':  'acMgmt.self',
  brand_account:        'acMgmt.brand',
  branch_account:       'acMgmt.branch',
};

async function expectedScopeForAssetRow(assetRow: {
  member_account_id?: string | null;
  access_application_id?: string | null;
  access_type?: string | null;
}) {
  if (assetRow.member_account_id) {
    const account = await prisma.account.findUnique({
      where: { id: assetRow.member_account_id },
      select: { accountType: true },
    });
    return expectedRoleScopeForAccount(account?.accountType, 'manageable');
  }

  const type = (assetRow.access_type ?? '').trim().toLowerCase();
  return ASSET_TYPE_TO_ROLE_SCOPE[type] || null;
}

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
      select: { access_type: true, member_account_id: true, access_application_id: true },
    });

    if (!assetRow) return [];

    const roleScope = await expectedScopeForAssetRow(assetRow);
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

  const canAdd = await hasAnyPermission(ACCESS_TEAM_ADD_PERMISSIONS);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
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
            status: 'active',
          },
          select: { id: true, memberAccountId: true },
        })
      : await prisma.account.findUnique({
          where: { id: input.memberId },
          select: { id: true },
        }).then((a) => (a ? { id: a.id, memberAccountId: a.id } : null));

    if (!member) {
      return { success: false, error: groupId ? 'Member not found in this group.' : 'Account not found.' };
    }

    if (!groupId) {
      const directAssets = await prisma.asset.findMany({
        where: { id: { in: input.assetIds } },
        select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
      });

      if (directAssets.length !== input.assetIds.length) {
        return { success: false, error: 'One or more assets were not found.' };
      }

      for (const asset of directAssets) {
        const sharedAsset = await prisma.asset.findFirst({
          where: {
            OR: [
              { member_account_id: toLogicalAssetId(asset) },
              { access_application_id: toLogicalAssetId(asset) },
              { member_connection_id: toLogicalAssetId(asset) },
              { member_portfolio_id: toLogicalAssetId(asset) },
            ],
            access_type: asset.access_type,
            parentPortfolio: {
              members: {
                some: {
                  memberAccountId: { not: accountId },
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
              { member_account_id: { in: input.assetIds } },
              { access_application_id: { in: input.assetIds } },
              { member_connection_id: { in: input.assetIds } },
              { member_portfolio_id: { in: input.assetIds } },
            ],
          },
          select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
        })
      : await prisma.asset.findMany({
          where: {
            OR: [
              { member_account_id: { in: input.assetIds } },
              { access_application_id: { in: input.assetIds } },
              { member_connection_id: { in: input.assetIds } },
              { member_portfolio_id: { in: input.assetIds } },
            ],
            access_type: toPortfolioAssetType(input.assetType),
          },
          select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
          orderBy: { id: 'asc' },
        });

    const existingAssetMap = new Map(existingAssets.map((a) => [toLogicalAssetId(a), a]));
    const portfolioAssets: Array<{
      id: string;
      member_account_id: string | null;
      access_application_id: string | null;
      member_connection_id: string | null;
      member_portfolio_id: string | null;
      access_type: string;
    }> = [];

    const accountAssetIds = input.assetIds.filter((assetId) => input.assetType !== 'application');
    if (accountAssetIds.length > 0) {
      const [targetAccounts, roles] = await Promise.all([
        prisma.account.findMany({
          where: { id: { in: accountAssetIds } },
          select: { id: true, accountType: true },
        }),
        prisma.authzRole.findMany({
          where: { id: { in: input.roleIds } },
          select: { id: true, scope: true },
        }),
      ]);

      if (targetAccounts.length !== accountAssetIds.length || roles.length !== input.roleIds.length) {
        return { success: false, error: 'One or more accounts or roles were not found.' };
      }

      const invalid = targetAccounts.some((targetAccount) =>
        roles.some((role) => !canAssignRoleScopeToAccount(role.scope, targetAccount.accountType, ['manageable']))
      );
      if (invalid) {
        return { success: false, error: 'One or more role scopes cannot be assigned to the selected account type.' };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Add missing assets to the portfolio only in portfolio mode.
      for (const rawAssetId of input.assetIds) {
        if (existingAssetMap.has(rawAssetId)) {
          portfolioAssets.push(existingAssetMap.get(rawAssetId)!);
        } else if (groupId) {
          const created = await tx.asset.create({
            data: {
              parent_portfolio_id: groupId,
              member_account_id: input.assetType === 'application' ? null : rawAssetId,
              access_application_id: input.assetType === 'application' ? rawAssetId : null,
              member_connection_id: null,
              member_portfolio_id: null,
              access_type: toPortfolioAssetType(input.assetType),
            },
            select: { id: true, member_account_id: true, access_application_id: true, member_connection_id: true, member_portfolio_id: true, access_type: true },
          });
          portfolioAssets.push(created);
        } else {
          return;
        }
      }

      // For each asset, update the grants: remove old roles, add new roles
      for (const asset of portfolioAssets) {
        // Remove all existing grants for this member on this asset in this portfolio
        await tx.access.deleteMany({
          where: {
            assetId: asset.id,
            memberAccountId: member.memberAccountId,
            parentPortfolioId: groupId,
          },
        });

        const childRef = assetChildRef(asset);
        if (!childRef) continue;

        // Add the new role grants
        for (const roleId of input.roleIds) {
          await ensureAccessGrant(tx, {
            memberAccountId: member.memberAccountId,
            ...(groupId ? { parentPortfolioId: groupId } : { parentAccountId: accountId }),
            ...childRef,
            accessApplicationId: ACCESS_APP_ID,
            roleId,
          } as Parameters<typeof ensureAccessGrant>[1]);
        }
      }
    });

    const totalAssigned = portfolioAssets.length * input.roleIds.length;

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
      select: { id: true, memberAccountId: true },
    });

    if (!member) return [];

    // Get all grants for this member in this portfolio
    const grants = await prisma.access.findMany({
      where: {
        memberAccountId: member.memberAccountId,
        parentPortfolioId: groupId,
        ...activeAccessWhere(),
      },
      select: {
        assetId: true,
        roleId: true,
        asset: {
          select: {
            id: true,
            member_account_id: true,
            access_application_id: true,
            member_connection_id: true,
            member_portfolio_id: true,
            access_type: true,
          },
        },
      },
    });

    // Group by asset
    const assetMap = new Map<string, { portfolioAssetId: string; assetId: string; assetType: string; roleIds: string[] }>();

    for (const grant of grants) {
      const key = grant.assetId;
      if (!assetMap.has(key)) {
        const assetId = toLogicalAssetId(grant.asset);
        assetMap.set(key, {
          portfolioAssetId: grant.asset.id,
          assetId,
          assetType: grant.asset.access_type,
          roleIds: [],
        });
      }
      assetMap.get(key)!.roleIds.push(grant.roleId);
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
