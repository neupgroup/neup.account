/**
 * services/bridge/application-roles.ts
 *
 * Returns roles for the given app, with permissions denormalized inline.
 *
 * Pagination:
 *   Offset mode  — ?start=0&end=100
 *   Cursor mode  — ?startFrom=<roleId>&limit=100
 *
 * Date filtering is not applicable to roles (no timestamp column), so
 * fromDate/toDate are accepted but silently ignored for this endpoint.
 *
 * Auth: appId + appSecret as query params.
 */

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationRolesResult =
  | {
      status: 200;
      body: {
        success: true;
        columns: string[];
        data: Record<string, unknown>[];
        meta: {
          total: number;
          returned: number;
          startedAt: string | null;
          endedAt: string | null;
        };
      };
    }
  | {
      status: 400 | 401 | 500;
      body: { success: false; error: string; error_description?: string };
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 100;

function clampLimit(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : PAGE_LIMIT;
  return Number.isFinite(n) && n > 0 ? Math.min(n, PAGE_LIMIT) : PAGE_LIMIT;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function getApplicationRoles(params: {
  appId: string | null;
  appSecret: string | null;
  account: string | null;
  start: string | null;
  end: string | null;
  startFrom: string | null;
  limit: string | null;
  fromDate: string | null;
  toDate: string | null;
}): Promise<ApplicationRolesResult> {
  const { appId, appSecret, account, start, end, startFrom, limit } = params;

  // 1. Validate credentials
  if (!appId || !appSecret) {
    return {
      status: 400,
      body: { success: false, error: 'appId and appSecret are required.' },
    };
  }

  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true, appSecret: true },
    });

    if (!application || application.appSecret !== appSecret) {
      return {
        status: 401,
        body: { success: false, error: 'Invalid application credentials.' },
      };
    }

    // 2. Resolve pagination
    let take: number;
    let skip: number | undefined;
    let cursorId: string | undefined;

    if (startFrom) {
      take = clampLimit(limit);
      cursorId = startFrom;
    } else {
      const startIdx = start ? parseInt(start, 10) : 0;
      const endIdx = end ? parseInt(end, 10) : PAGE_LIMIT;
      skip = Number.isFinite(startIdx) && startIdx >= 0 ? startIdx : 0;
      take = Number.isFinite(endIdx) && endIdx > skip ? Math.min(endIdx - skip, PAGE_LIMIT) : PAGE_LIMIT;
    }

    // 3. If account filter is provided, restrict roles to those granted to that account in this app.
    let allowedRoleIds: string[] | null = null;
    if (account) {
      const grantRoleRows = await prisma.role.findMany({
        where: {
          member: {
            memberType: 'account',
            memberAccountId: account,
            details: {
              path: ['legacy_parent_application_id'],
              equals: appId,
            },
          },
        },
        select: { roleId: true },
        distinct: ['roleId'],
      });
      allowedRoleIds = grantRoleRows.map((r) => r.roleId);
    }

    if (allowedRoleIds && allowedRoleIds.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          columns: ['roleId', 'roleName', 'roleDescription', 'roleScope', 'pushed', 'permissions'],
          data: [],
          meta: { total: 0, returned: 0, startedAt: null, endedAt: null },
        },
      };
    }

    const { total, roles } = await prisma.$transaction(async (tx) => {
      const where = {
        appId,
        pushed: false,
        ...(allowedRoleIds ? { id: { in: allowedRoleIds } } : {}),
      };

      // 4. Count total (unpushed only)
      const total = await tx.authzRole.count({ where });

      // 5. Fetch roles with their permission maps (unpushed only)
      const roles = await tx.authzRole.findMany({
        where,
        ...(cursorId
          ? { cursor: { id: cursorId }, skip: 1 }
          : { skip }),
        take,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
          pushed: true,
          permissions: true,
        },
      });

      // Mark returned roles as pushed (best-effort within txn)
      if (roles.length > 0) {
        await tx.authzRole.updateMany({
          where: { appId, id: { in: roles.map((r) => r.id) } },
          data: { pushed: true },
        });
      }

      return { total, roles };
    });

    // 6. Shape rows — permissions are denormalized inline
    const columns = [
      'roleId',
      'roleName',
      'roleDescription',
      'roleScope',
      'pushed',
      'permissions',
    ];

    const data = roles.map((r) => ({
      roleId: r.id,
      roleName: r.name,
      roleDescription: r.description,
      roleScope: r.scope,
      pushed: true,
      permissions: Array.isArray(r.permissions)
        ? r.permissions
            .filter((p): p is { id?: string; name?: string; description?: string | null; scope?: string | null } => Boolean(p) && typeof p === 'object')
            .map((p) => ({
              rolePermissionId: typeof p.id === 'string' ? `${r.id}::${p.id}` : null,
              permissionId: typeof p.id === 'string' ? p.id : null,
              permissionName: typeof p.name === 'string' ? p.name : null,
              permissionDescription: typeof p.description === 'string' ? p.description : null,
              permissionScope: typeof p.scope === 'string' ? p.scope : r.scope,
              denormalized: typeof p.name === 'string' ? [p.name] : null,
            }))
        : [],
    }));

    const startedAt = roles.length > 0 ? roles[0].id : null;
    const endedAt = roles.length > 0 ? roles[roles.length - 1].id : null;

    return {
      status: 200,
      body: {
        success: true,
        columns,
        data,
        meta: {
          total,
          returned: data.length,
          startedAt,
          endedAt,
        },
      },
    };
  } catch (error) {
    await logError('auth', error, `application/roles:${appId}`);
    return {
      status: 500,
      body: { success: false, error: 'Internal server error.' },
    };
  }
}
