import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import { ensureAccessGrant } from '@/services/access-model';
import { getCompatibleRolePermissionScopePairs, normalizeAuthzScopeFor, normalizeAuthzScopeLevels, normalizeSingleAuthzScopeLevel } from '@/services/applications/authz-scope-policy';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifySecret(request: NextRequest): boolean {
  const secret = process.env.BRIDGE_WEBHOOK_SECRET;
  if (!secret) return false;
  return request.headers.get('x-bridge-secret') === secret;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Table =
  | 'authz_role_permission_map'
  | 'authz_role_capability'
  | 'authz_account_access_grant'
  | 'authz_assets_access_grant';

type Operation =
  | 'insert'
  | 'updateOne'
  | 'update'
  | 'deleteOne'
  | 'delete'
  | 'deleteAll';

type WebhookBody = {
  table: Table;
  operation: Operation;
  data?: Record<string, unknown> | Record<string, unknown>[];
  id?: string | string[];
};

function assetChildRef(asset: {
  member_account_id?: string | null;
  access_application_id?: string | null;
  member_connection_id?: string | null;
}) {
  if (asset.member_account_id) return { childAccountId: asset.member_account_id };
  if (asset.access_application_id) return { childApplicationId: asset.access_application_id };
  if (asset.member_connection_id) return { childConnectionId: asset.member_connection_id };
  return null;
}

const VALID_TABLES: Table[] = [
  'authz_role_permission_map',
  'authz_role_capability',
  'authz_account_access_grant',
  'authz_assets_access_grant',
];

const VALID_OPERATIONS: Operation[] = [
  'insert',
  'updateOne',
  'update',
  'deleteOne',
  'delete',
  'deleteAll',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

async function syncRolePermissionSnapshots(tx: any, roleId: string): Promise<void> {
  const mappedPermissions = await tx.authzRolePermissionMap.findMany({
    where: { roleId },
    select: {
      permission: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const permissions = Array.from(
    new Set(
      mappedPermissions
        .map((row: { permission?: { name?: string } }) => row.permission?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0),
    ),
  );

  await tx.authzRole.update({
    where: { id: roleId },
    data: { permissions },
  });

  await tx.role.updateMany({
    where: { roleId },
    data: { permissions },
  });
}

async function syncAffectedRoleSnapshots(tx: any, roleIds: string[]): Promise<void> {
  const uniqueRoleIds = Array.from(new Set(roleIds.filter((roleId) => typeof roleId === 'string' && roleId.length > 0)));
  for (const roleId of uniqueRoleIds) {
    await syncRolePermissionSnapshots(tx, roleId);
  }
}

async function resolveRolePermissionPolicy(
  tx: any,
  roleId: string,
  permissionId: string,
): Promise<Array<{ scopeFor: string; scopeLevel: string }>> {
  const [role, permission] = await Promise.all([
    tx.authzRole.findUnique({
      where: { id: roleId },
      select: { scopeFor: true, scopeLevel: true, acquisitionType: true, approvalPolicy: true },
    }),
    tx.authzPermission.findUnique({
      where: { id: permissionId },
      select: { scopeFor: true, scopeLevel: true },
    }),
  ]);

  if (!role || !permission) return [];

  return getCompatibleRolePermissionScopePairs({
    roleScopeFor: normalizeAuthzScopeFor(role.scopeFor),
    roleScopeLevel: normalizeSingleAuthzScopeLevel(role.scopeLevel),
    permissionScopeFor: normalizeAuthzScopeFor(permission.scopeFor),
    permissionScopeLevels: normalizeAuthzScopeLevels(permission.scopeLevel),
  });
}

// ---------------------------------------------------------------------------
// Table handlers
// ---------------------------------------------------------------------------

async function handleRolePermission(operation: Operation, body: WebhookBody): Promise<NextResponse> {
  switch (operation) {
    case 'insert': {
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data as Record<string, any>;
      if (!d.roleId || !d.permissionId) return err('Missing required fields: `roleId`, `permissionId`.', 400);
      const role = await prisma.authzRole.findUnique({
        where: { id: d.roleId as string },
        select: { id: true },
      });
      if (!role) return err('Role not found.', 404);

      const permission = await prisma.authzPermission.findUnique({
        where: { id: d.permissionId as string },
        select: { id: true },
      });
      if (!permission) return err('Permission not found.', 404);

      const id = crypto.randomUUID();
      await prisma.$transaction(async (tx) => {
        const scopePairs = await resolveRolePermissionPolicy(tx, d.roleId as string, d.permissionId as string);
        if (scopePairs.length === 0) {
          throw new Error('Role and permission scope_for/scope_level are incompatible.');
        }

        await tx.authzRolePermissionMap.deleteMany({
          where: {
            roleId: d.roleId as string,
            permissionId: d.permissionId as string,
          },
        });

        await tx.authzRolePermissionMap.createMany({
          data: scopePairs.map((pair, index) => ({
            id: index === 0 ? id : crypto.randomUUID(),
            roleId: d.roleId as string,
            permissionId: d.permissionId as string,
            scopeFor: pair.scopeFor,
            scopeLevel: pair.scopeLevel,
          })),
          skipDuplicates: true,
        });

        await syncRolePermissionSnapshots(tx, d.roleId as string);
      });

      return ok({ id }, 201);
    }

    case 'updateOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data as Record<string, any>;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.authzRolePermissionMap.findUnique({
          where: { id: body.id as string },
          select: { roleId: true, permissionId: true, scopeFor: true, scopeLevel: true } as any,
        });
        if (!existing) return;

        const nextRoleId = typeof d.roleId === 'string' && d.roleId.trim() ? d.roleId.trim() : existing.roleId;
        const nextPermissionId =
          typeof d.permissionId === 'string' && d.permissionId.trim() ? d.permissionId.trim() : existing.permissionId;

        if (nextRoleId !== existing.roleId || nextPermissionId !== existing.permissionId) {
          const scopePairs = await resolveRolePermissionPolicy(tx, nextRoleId, nextPermissionId);
          if (scopePairs.length === 0) {
            throw new Error('Role and permission scope_for/scope_level are incompatible.');
          }

          await tx.authzRolePermissionMap.deleteMany({
            where: { roleId: existing.roleId, permissionId: existing.permissionId },
          });
          await tx.authzRolePermissionMap.createMany({
            data: scopePairs.map((pair) => ({
              id: crypto.randomUUID(),
              roleId: nextRoleId,
              permissionId: nextPermissionId,
              scopeFor: pair.scopeFor,
              scopeLevel: pair.scopeLevel,
            })),
            skipDuplicates: true,
          });
          await syncAffectedRoleSnapshots(tx, [existing.roleId, nextRoleId]);
        }
      });

      return ok({ ok: true });
    }

    case 'update': {
      if (!Array.isArray(body.data)) return err('Missing required field: `data` (array).', 400);
      const touchedRoles: string[] = [];

      await prisma.$transaction(async (tx) => {
        for (const item of body.data as Record<string, any>[]) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
          const record = item as Record<string, unknown>;
          const id = typeof record.id === 'string' ? record.id.trim() : '';
          const roleId = typeof record.roleId === 'string' ? record.roleId.trim() : '';
          const permissionId = typeof record.permissionId === 'string' ? record.permissionId.trim() : '';

          if (id) {
            const existing = await tx.authzRolePermissionMap.findUnique({
              where: { id },
              select: { roleId: true, permissionId: true, scopeFor: true, scopeLevel: true } as any,
            });
            if (!existing) continue;

            const nextRoleId = roleId || existing.roleId;
            const nextPermissionId = permissionId || existing.permissionId;
            if (nextRoleId !== existing.roleId || nextPermissionId !== existing.permissionId) {
              const scopePairs = await resolveRolePermissionPolicy(tx, nextRoleId, nextPermissionId);
              if (scopePairs.length === 0) continue;
              await tx.authzRolePermissionMap.deleteMany({
                where: { roleId: existing.roleId, permissionId: existing.permissionId },
              });
              await tx.authzRolePermissionMap.createMany({
                data: scopePairs.map((pair) => ({
                  id: crypto.randomUUID(),
                  roleId: nextRoleId,
                  permissionId: nextPermissionId,
                  scopeFor: pair.scopeFor,
                  scopeLevel: pair.scopeLevel,
                })),
                skipDuplicates: true,
              });
              touchedRoles.push(existing.roleId, nextRoleId);
            }
            continue;
          }

          if (!roleId || !permissionId) continue;
          const scopePairs = await resolveRolePermissionPolicy(tx, roleId, permissionId);
          if (scopePairs.length === 0) continue;
          await tx.authzRolePermissionMap.deleteMany({
            where: { roleId, permissionId },
          });
          await tx.authzRolePermissionMap.createMany({
            data: scopePairs.map((pair) => ({
              id: crypto.randomUUID(),
              roleId,
              permissionId,
              scopeFor: pair.scopeFor,
              scopeLevel: pair.scopeLevel,
            })),
            skipDuplicates: true,
          });
          touchedRoles.push(roleId);
        }

        await syncAffectedRoleSnapshots(tx, touchedRoles);
      });

      return ok({ ok: true });
    }

    case 'deleteOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      await prisma.$transaction(async (tx) => {
        const existing = await tx.authzRolePermissionMap.findUnique({
          where: { id: body.id as string },
          select: { roleId: true },
        });
        if (!existing) return;
        await tx.authzRolePermissionMap.delete({ where: { id: body.id as string } });
        await syncRolePermissionSnapshots(tx, existing.roleId);
      });
      return ok({ ok: true });
    }

    case 'delete': {
      if (!Array.isArray(body.id)) return err('Missing required field: `id` (array of strings).', 400);
      await prisma.$transaction(async (tx) => {
        const rows = await tx.authzRolePermissionMap.findMany({
          where: { id: { in: body.id as string[] } },
          select: { roleId: true },
        });
        if (rows.length === 0) return;
        await tx.authzRolePermissionMap.deleteMany({
          where: { id: { in: body.id as string[] } },
        });
        await syncAffectedRoleSnapshots(tx, rows.map((row) => row.roleId));
      });
      return ok({ ok: true, count: body.id.length });
    }

    case 'deleteAll': {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.authzRolePermissionMap.findMany({
          select: { roleId: true },
        });
        if (rows.length === 0) {
          await tx.authzRolePermissionMap.deleteMany();
          return;
        }
        await tx.authzRolePermissionMap.deleteMany();
        await syncAffectedRoleSnapshots(tx, rows.map((row) => row.roleId));
      });
      return ok({ ok: true, skipped: false });
    }
  }
}

async function handleAccountAccessGrant(operation: Operation, body: WebhookBody): Promise<NextResponse> {
  switch (operation) {
    case 'insert': {
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data;
      if (!d.accessTo || !d.memberId || !d.roleId || !d.appId)
        return err('Missing required fields: `accessTo`, `memberId`, `roleId`, `appId`.', 400);
      const role = await prisma.authzRole.findFirst({
        where: { id: d.roleId as string, appId: d.appId as string },
        select: { id: true, name: true, permissions: true },
      });
      if (!role) return err('Role not found for app.', 404);

      const record = await prisma.$transaction(async (tx) => {
        const grant = await ensureAccessGrant(tx, {
          memberAccountId: d.memberId as string,
          parentAccountId: d.accessTo as string,
          childApplicationId: d.appId as string,
          accessApplicationId: d.appId as string,
          roleId: role.id,
        });

        return grant;
      });
      return ok({ id: record.id }, 201);
    }

    case 'updateOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data;
      await prisma.access.update({
        where: { id: body.id },
        data: {
          ...(d.roleId !== undefined && { roleId: d.roleId as string }),
        },
      });
      return ok({ ok: true });
    }

    case 'update': {
      if (!Array.isArray(body.data)) return err('Missing required field: `data` (array).', 400);
      await Promise.all(body.data.map(async (item) => {
        const { id, roleId } = item as Record<string, unknown>;
        if (!id || typeof id !== 'string') return;
        await handleAccountAccessGrant('updateOne', {
          table: body.table,
          operation: 'updateOne',
          id,
          data: { roleId },
        });
      }));
      return ok({ ok: true, count: body.data.length });
    }

    case 'deleteOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      await prisma.access.delete({ where: { id: body.id } });
      return ok({ ok: true });
    }

    case 'delete': {
      if (!Array.isArray(body.id)) return err('Missing required field: `id` (array of strings).', 400);
      const result = await prisma.access.deleteMany({ where: { id: { in: body.id as string[] } } });
      return ok({ ok: true, count: result.count });
    }

    case 'deleteAll': {
      const result = await prisma.access.deleteMany();
      return ok({ ok: true, count: result.count });
    }
  }
}

async function handleAssetsAccessGrant(operation: Operation, body: WebhookBody): Promise<NextResponse> {
  switch (operation) {
    case 'insert': {
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data;
      if (!d.assetId || !d.accountId || !d.roleId || !d.appId)
        return err('Missing required fields: `assetId`, `accountId`, `roleId`, `appId`.', 400);
      const asset = await prisma.asset.findUnique({
        where: { id: d.assetId as string },
        select: {
          id: true,
          member_account_id: true,
          access_application_id: true,
          member_connection_id: true,
        },
      });
      if (!asset) return err('Asset not found.', 404);
      const childRef = assetChildRef(asset);
      if (!childRef) return err('Asset has no child reference.', 400);

      const record = await ensureAccessGrant(prisma, {
        memberAccountId: d.accountId as string,
        parentAccountId: (d.accessTo as string) || (d.accountId as string),
        ...childRef,
        accessApplicationId: d.appId as string,
        roleId: d.roleId as string,
      } as Parameters<typeof ensureAccessGrant>[1]);
      return ok({ id: record.id }, 201);
    }

    case 'updateOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      if (!body.data || Array.isArray(body.data)) return err('Missing required field: `data` (object).', 400);
      const d = body.data;
      await prisma.access.update({
        where: { id: body.id },
        data: {
          ...(d.roleId !== undefined && { roleId: d.roleId as string }),
        },
      });
      return ok({ ok: true });
    }

    case 'update': {
      if (!Array.isArray(body.data)) return err('Missing required field: `data` (array).', 400);
      await Promise.all(
        body.data.map((item) => {
          const { id, roleId } = item;
          if (!id) return Promise.resolve();
          return prisma.access.update({
            where: { id: id as string },
            data: {
              ...(roleId !== undefined && { roleId: roleId as string }),
            },
          });
        })
      );
      return ok({ ok: true, count: body.data.length });
    }

    case 'deleteOne': {
      if (typeof body.id !== 'string') return err('Missing required field: `id` (string).', 400);
      await prisma.access.delete({ where: { id: body.id } });
      return ok({ ok: true });
    }

    case 'delete': {
      if (!Array.isArray(body.id)) return err('Missing required field: `id` (array of strings).', 400);
      const result = await prisma.access.deleteMany({ where: { id: { in: body.id as string[] } } });
      return ok({ ok: true, count: result.count });
    }

    case 'deleteAll': {
      const result = await prisma.access.deleteMany();
      return ok({ ok: true, count: result.count });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /bridge/webhook.v1/authz/role
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  if (!verifySecret(request)) {
    return err('Missing or invalid x-bridge-secret header.', 401);
  }

  // 2. Parse body
  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return err('Request body must be valid JSON.', 400);
  }

  // 3. Validate table + operation
  if (!body.table || !VALID_TABLES.includes(body.table)) {
    return err(`Invalid or missing \`table\`. Must be one of: ${VALID_TABLES.join(', ')}.`, 400);
  }
  if (!body.operation || !VALID_OPERATIONS.includes(body.operation)) {
    return err(`Invalid or missing \`operation\`. Must be one of: ${VALID_OPERATIONS.join(', ')}.`, 400);
  }

  // 4. Dispatch
  try {
    switch (body.table) {
      case 'authz_role_capability':
        return await handleRolePermission(body.operation, body);
      case 'authz_account_access_grant':
        return await handleAccountAccessGrant(body.operation, body);
      case 'authz_assets_access_grant':
        return await handleAssetsAccessGrant(body.operation, body);
    }
  } catch (error) {
    await logError('webhook', error, `authz/role:${body.table}:${body.operation}`);
    return err('Database or service error.', 500);
  }

  return err('Invalid table or operation.', 400);
}
