import prisma from '@/core/helpers/prisma';
import type { Prisma } from '@/prisma/generated/client/client';
import type { AssetType } from '@/prisma/generated/client';

type Tx = Prisma.TransactionClient;

type ParentRef =
  | { parentAccountId: string; parentPortfolioId?: never }
  | { parentPortfolioId: string; parentAccountId?: never };

type AssetChildRef =
  | { childAccountId: string; childConnectionId?: never; childApplicationId?: never; childPortfolioId?: never }
  | { childConnectionId: string; childAccountId?: never; childApplicationId?: never; childPortfolioId?: never }
  | { childApplicationId: string; childAccountId?: never; childConnectionId?: never; childPortfolioId?: never }
  | { childPortfolioId: string; childAccountId?: never; childConnectionId?: never; childApplicationId?: never };

export type AccessGrantInput = ParentRef & AssetChildRef & {
  memberAccountId: string;
  roleId: string;
  accessApplicationId?: string | null;
  isTemporary?: Date | null;
  details?: Prisma.InputJsonValue;
};

function activeWhere() {
  const now = new Date();
  return {
    status: 'active',
    OR: [{ isTemporary: null }, { isTemporary: { gt: now } }],
  };
}

function memberTypeForParent(parent: ParentRef): 'acc_in_acc' | 'acc_in_port' {
  return 'parentPortfolioId' in parent ? 'acc_in_port' : 'acc_in_acc';
}

export function assetTypeForRefs(parent: ParentRef, child: AssetChildRef): AssetType {
  if ('parentPortfolioId' in parent) {
    if ('childAccountId' in child) return 'acc_in_port';
    if ('childConnectionId' in child) return 'conn_in_port';
    if ('childApplicationId' in child) return 'app_in_port';
  }

  if ('childAccountId' in child) return 'acc_in_acc';
  if ('childConnectionId' in child) return 'conn_in_acc';
  if ('childApplicationId' in child) return 'app_in_acc';
  return 'port_in_acc';
}

export function getLogicalAssetId(asset: {
  member_account_id?: string | null;
  member_connection_id?: string | null;
  access_application_id?: string | null;
  member_portfolio_id?: string | null;
  id: string;
}) {
  return asset.member_account_id ?? asset.member_connection_id ?? asset.access_application_id ?? asset.member_portfolio_id ?? asset.id;
}

export async function cleanupExpiredAccessModel(tx: Tx = prisma) {
  const now = new Date();

  await tx.access.deleteMany({
    where: {
      isTemporary: { not: null, lte: now },
    },
  });

  await tx.asset.deleteMany({
    where: {
      isTemporary: { not: null, lte: now },
    },
  });

  await tx.member.deleteMany({
    where: {
      isTemporary: { not: null, lte: now },
    },
  });
}

export async function ensureAccessMember(tx: Tx, input: ParentRef & {
  childAccountId: string;
  isTemporary?: Date | null;
  status?: string;
  details?: Prisma.InputJsonValue;
}) {
  const memberType = memberTypeForParent(input);
  const existing = await tx.member.findFirst({
    where: {
      memberType,
      memberAccountId: input.childAccountId,
      parentAccountId: 'parentAccountId' in input ? input.parentAccountId : null,
      parentPortfolioId: 'parentPortfolioId' in input ? input.parentPortfolioId : null,
      ...activeWhere(),
    },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.member.create({
    data: {
      memberType,
      memberAccountId: input.childAccountId,
      parentAccountId: 'parentAccountId' in input ? input.parentAccountId : null,
      parentPortfolioId: 'parentPortfolioId' in input ? input.parentPortfolioId : null,
      status: input.status ?? 'active',
      isTemporary: input.isTemporary ?? null,
      details: input.details,
    },
    select: { id: true },
  });
}

export async function ensureAccessAsset(tx: Tx, input: ParentRef & AssetChildRef & {
  isTemporary?: Date | null;
  status?: string;
  details?: Prisma.InputJsonValue;
}) {
  const type = assetTypeForRefs(input, input);
  const existing = await tx.asset.findFirst({
    where: {
      access_type: type,
      member_account_id: 'childAccountId' in input ? input.childAccountId : null,
      member_connection_id: 'childConnectionId' in input ? input.childConnectionId : null,
      access_application_id: 'childApplicationId' in input ? input.childApplicationId : null,
      member_portfolio_id: 'childPortfolioId' in input ? input.childPortfolioId : null,
      parent_account_id: 'parentAccountId' in input ? input.parentAccountId : null,
      parent_portfolio_id: 'parentPortfolioId' in input ? input.parentPortfolioId : null,
      ...activeWhere(),
    },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.asset.create({
    data: {
      access_type: type,
      member_account_id: 'childAccountId' in input ? input.childAccountId : null,
      member_connection_id: 'childConnectionId' in input ? input.childConnectionId : null,
      access_application_id: 'childApplicationId' in input ? input.childApplicationId : null,
      member_portfolio_id: 'childPortfolioId' in input ? input.childPortfolioId : null,
      parent_account_id: 'parentAccountId' in input ? input.parentAccountId : null,
      parent_portfolio_id: 'parentPortfolioId' in input ? input.parentPortfolioId : null,
      status: input.status ?? 'active',
      isTemporary: input.isTemporary ?? null,
      details: input.details,
    },
    select: { id: true },
  });
}

export async function ensureAccessGrant(tx: Tx, input: AccessGrantInput) {
  const member = await ensureAccessMember(tx, {
    childAccountId: input.memberAccountId,
    parentAccountId: 'parentAccountId' in input ? input.parentAccountId : undefined,
    parentPortfolioId: 'parentPortfolioId' in input ? input.parentPortfolioId : undefined,
    isTemporary: input.isTemporary ?? null,
  } as ParentRef & { childAccountId: string; isTemporary?: Date | null });

  const asset = await ensureAccessAsset(tx, input);
  const accessType = assetTypeForRefs(input, input);

  const existing = await tx.access.findFirst({
    where: {
      accessType,
      memberId: member.id,
      assetId: asset.id,
      roleId: input.roleId,
      ...activeWhere(),
    },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.access.create({
    data: {
      accessType,
      memberId: member.id,
      memberAccountId: input.memberAccountId,
      parentAccountId: 'parentAccountId' in input ? input.parentAccountId : null,
      parentPortfolioId: 'parentPortfolioId' in input ? input.parentPortfolioId : null,
      assetId: asset.id,
      assetAccountId: 'childAccountId' in input ? input.childAccountId : null,
      assetConnectionId: 'childConnectionId' in input ? input.childConnectionId : null,
      assetApplicationId: 'childApplicationId' in input ? input.childApplicationId : null,
      assetPortfolioId: 'childPortfolioId' in input ? input.childPortfolioId : null,
      accessApplicationId: input.accessApplicationId ?? ('childApplicationId' in input ? input.childApplicationId : null),
      roleId: input.roleId,
      status: 'active',
      isTemporary: input.isTemporary ?? null,
      details: input.details,
    },
    select: { id: true },
  });
}

export function extractRolePermissionNames(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value.flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim();
      return name ? [name] : [];
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    return name ? [name] : [];
  })));
}

export async function getAccessPermissionNames(accessRows: Array<{ role: { permissions: Prisma.JsonValue | null } }>) {
  return Array.from(new Set(accessRows.flatMap((row) => extractRolePermissionNames(row.role.permissions))));
}

export function activeAccessWhere() {
  return activeWhere();
}
