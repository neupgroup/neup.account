import prisma from '@/.neup/core/database/prisma';
import { Prisma } from '@/.neup/core/database/prisma';
import type { AccessType, AssetType } from '@/.neup/core/database/prisma';
import { normalizeSingleAuthzScopeLevel } from '@/services/applications/authz-scope-policy';

/**
 * ::neup.documentation::access-model-module
 * ::title Access Model Helpers
 *
 * Core helpers for creating and maintaining the denormalized access, asset, and member records.
 *
 * ::public
 *
 * Use this module to ensure member rows, asset rows, and access grants exist consistently for the new access model.
 *
 * ::public end
 *
 * ::private
 *
 * These helpers are the low-level write layer behind the migration from legacy member/asset-shaped grants to the consolidated `access` table model.
 *
 * ::private end
 *
 * ::end
 */
type Tx = Prisma.TransactionClient;

type ParentRef = { parentAccountId: string };

type AssetChildRef =
  | { childAccountId: string; childConnectionId?: never; childApplicationId?: never }
  | { childConnectionId: string; childAccountId?: never; childApplicationId?: never }
  | { childApplicationId: string; childAccountId?: never; childConnectionId?: never };

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

function isSelfAccountMember(input: ParentRef & { childAccountId: string }) {
  return 'parentAccountId' in input && input.parentAccountId === input.childAccountId;
}

function memberTypeForParent(parent: ParentRef & { childAccountId: string }): 'acc_self' | 'acc_in_acc' {
  return isSelfAccountMember(parent) ? 'acc_self' : 'acc_in_acc';
}

export function assetTypeForRefs(parent: ParentRef, child: AssetChildRef): AssetType {
  if ('childAccountId' in child) return 'acc_in_acc';
  if ('childConnectionId' in child) return 'conn_in_acc';
  return 'app_in_acc';
}

function accessTypeForGrant(input: AccessGrantInput, roleScopeLevel: unknown): AccessType {
  const isSelfGrant = 'parentAccountId' in input && input.parentAccountId === input.memberAccountId;
  if (!isSelfGrant) return assetTypeForRefs(input, input);

  return normalizeSingleAuthzScopeLevel(roleScopeLevel) === 'assignable.byRoot'
    ? 'acc_self_root'
    : 'acc_self';
}

export function getLogicalAssetId(asset: {
  member_account_id?: string | null;
  member_connection_id?: string | null;
  access_application_id?: string | null;
  id: string;
}) {
  return asset.member_account_id ?? asset.member_connection_id ?? asset.access_application_id ?? asset.id;
}

export async function cleanupExpiredAccessModel(tx: Tx = prisma) {
  /**
   * ::neup.documentation::access-model-cleanup-expired
   * ::function cleanupExpiredAccessModel(tx)
   *
   * Deletes expired temporary rows from the access-model tables.
   *
   * ::public
   *
   * Expired rows are removed from `access`, `asset`, and `member`.
   *
   * ::public end
   *
   * ::private
   *
   * Callers may pass an existing transaction client so cleanup participates in a larger transaction.
   *
   * ::private end
   *
   * ::end
   */
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
  const selfMember = isSelfAccountMember(input);
  const existing = await tx.member.findFirst({
    where: {
      memberType,
      memberAccountId: selfMember ? null : input.childAccountId,
      parentAccountId: input.parentAccountId,
      ...activeWhere(),
    },
    select: { id: true },
  });

  if (existing) return existing;

  if (selfMember) {
    const legacySelfMember = await tx.member.findFirst({
      where: {
        memberType: 'acc_in_acc',
        memberAccountId: input.childAccountId,
        parentAccountId: input.parentAccountId,
        ...activeWhere(),
      },
      select: { id: true },
    });

    if (legacySelfMember) {
      return tx.member.update({
        where: { id: legacySelfMember.id },
        data: {
          memberType: 'acc_self',
          memberAccountId: null,
          parentAccountId: input.parentAccountId,
          status: input.status ?? 'active',
          isTemporary: input.isTemporary ?? null,
          details: input.details,
        },
        select: { id: true },
      });
    }
  }

  return tx.member.create({
    data: {
      memberType,
      memberAccountId: selfMember ? null : input.childAccountId,
      parentAccountId: input.parentAccountId,
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
      parent_account_id: input.parentAccountId,
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
      parent_account_id: input.parentAccountId,
      status: input.status ?? 'active',
      isTemporary: input.isTemporary ?? null,
      details: input.details,
    },
    select: { id: true },
  });
}

export async function ensureAccessGrant(tx: Tx, input: AccessGrantInput) {
  /**
   * ::neup.documentation::access-model-ensure-access-grant
   * ::function ensureAccessGrant(tx, input)
   *
   * Ensures the member, asset, and access-grant records exist for one assignment.
   *
   * ::public
   *
   * This helper is the main creation path for denormalized access grants in the new access model.
   *
   * ::public end
   *
   * ::private
   *
   * The role's scope level is consulted to decide whether a self grant should be stored as `acc_self` or `acc_self_root`.
   *
   * ::private end
   *
   * ::end
   */
  const roleRows = await tx.$queryRaw<Array<{ scopeLevel: string | null }>>(Prisma.sql`
    SELECT r."scope_level" AS "scopeLevel"
    FROM "authz_role" r
    WHERE r."id" = ${input.roleId}
    LIMIT 1
  `);
  const roleScopeLevel = roleRows[0]?.scopeLevel ?? null;
  if (!roleScopeLevel) {
    throw new Error(`Access role "${input.roleId}" was not found.`);
  }

  const member = await ensureAccessMember(tx, {
    childAccountId: input.memberAccountId,
    parentAccountId: input.parentAccountId,
    isTemporary: input.isTemporary ?? null,
  } as ParentRef & { childAccountId: string; isTemporary?: Date | null });

  const asset = await ensureAccessAsset(tx, input);
  const accessType = accessTypeForGrant(input, roleScopeLevel);

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
      parentAccountId: input.parentAccountId,
      assetId: asset.id,
      assetAccountId: 'childAccountId' in input ? input.childAccountId : null,
      assetConnectionId: 'childConnectionId' in input ? input.childConnectionId : null,
      assetApplicationId: 'childApplicationId' in input ? input.childApplicationId : null,
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
  /**
   * ::neup.documentation::access-model-extract-role-permission-names
   * ::function extractRolePermissionNames(value)
   *
   * Extracts permission names from a stored authz-role permission payload.
   *
   * ::public
   *
   * The payload may contain raw strings or objects with `id` or `name` fields.
   *
   * ::public end
   *
   * ::private
   *
   * The result is deduplicated and trimmed so callers can rely on a clean permission name list.
   *
   * ::private end
   *
   * ::end
   */
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value.flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim();
      return name ? [name] : [];
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const name =
      typeof item.id === 'string'
        ? item.id.trim()
        : typeof item.name === 'string'
        ? item.name.trim()
        : '';
    return name ? [name] : [];
  })));
}

export async function getAccessPermissionNames(accessRows: Array<{ role: { permissions: Prisma.JsonValue | null } }>) {
  return Array.from(new Set(accessRows.flatMap((row) => extractRolePermissionNames(row.role.permissions))));
}

export function activeAccessWhere() {
  return activeWhere();
}
