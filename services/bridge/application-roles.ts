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

import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { activeAccessWhere } from '@/services/access-model';
import { getRoleAccessFlags } from '@/services/role-scopes';
import { deriveLegacyRoleScopesFromPolicy, normalizeAuthzScopeFor, normalizeSingleAuthzScopeLevel } from '@/services/applications/authz-scope-policy';
import { normalizeApplicationId } from '@/services/applications/identifiers';

/*
::neup.documentation::application-roles-service
::title Application Roles Export Service

Builds the paginated role export for an application.

::public

This file owns credential validation, role pagination, optional account scoping, and denormalized permission shaping for role export.

::public end

::private

The export marks returned roles as pushed inside the transaction. That behavior should be documented here instead of only in route prose.

::private end

::end
*/

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

/*
::neup.documentation::get-application-roles
::function getApplicationRoles(params)

Returns paginated role export rows for an application.

::public

The response includes role metadata and inline permission objects.

::public end

::private

When an `account` filter is provided, the export is narrowed to roles actually granted to that account in the target app.

::private end

::end
*/
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
  const appId = normalizeApplicationId(params.appId);
  const { appSecret, account, start, end, startFrom, limit } = params;

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
      const grantRoleRows = await prisma.access.findMany({
        where: {
          memberAccountId: account,
          accessApplicationId: appId,
          ...activeAccessWhere(),
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
          scopeFor: true,
          scopeLevel: true,
          acquisitionType: true,
          approvalPolicy: true,
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
      'roleAcquisitionType',
      'roleApprovalPolicy',
      'assignable.byTeam',
      'assignable.toSelf.publicly',
      'assignable.byRoot',
      'assignable.toSelf.publicly.byRequest',
      'assignable.byTeam.fromRequest',
      'pushed',
      'permissions',
    ];

    const data = roles.map((r) => {
      const accessFlags = getRoleAccessFlags(r.acquisitionType, r.approvalPolicy);

      return {
        roleId: r.id,
        roleName: r.name,
        roleDescription: r.description,
        roleScope: deriveLegacyRoleScopesFromPolicy(
          normalizeAuthzScopeFor(r.scopeFor),
          normalizeSingleAuthzScopeLevel(r.scopeLevel),
        ),
        roleAcquisitionType: r.acquisitionType,
        roleApprovalPolicy: r.approvalPolicy,
        'assignable.byTeam': accessFlags.assignable,
        'assignable.toSelf.publicly': accessFlags.publiclyEnrollable,
        'assignable.byRoot': accessFlags.rootAssigned,
        'assignable.toSelf.publicly.byRequest': accessFlags.publiclyRequestable,
        'assignable.byTeam.fromRequest': accessFlags.requestableToOwner,
        pushed: true,
        permissions: Array.isArray(r.permissions)
          ? r.permissions.flatMap((p) => {
              if (typeof p === 'string') {
                const name = p.trim();
                return name
                  ? [{
                      rolePermissionId: null,
                      permissionId: null,
                      permissionName: name,
                      permissionDescription: null,
                      permissionTag: null,
                      denormalized: [name],
                    }]
                  : [];
              }

              if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
              const obj = p as { id?: string; name?: string; description?: string | null; tag?: unknown };
              const name = typeof obj.name === 'string' ? obj.name.trim() : '';
              if (!name) return [];

              return [{
                rolePermissionId: typeof obj.id === 'string' ? `${r.id}::${obj.id}` : null,
                permissionId: typeof obj.id === 'string' ? obj.id : null,
                permissionName: name,
                permissionDescription: typeof obj.description === 'string' ? obj.description : null,
                permissionTag: obj.tag ?? null,
                denormalized: [name],
              }];
            })
          : [],
      };
    });

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
