/**
 * services/bridge/application-access.ts
 *
 * Returns AuthzAppAccessGrant rows for the given app — i.e. who has been
 * granted what role by whom, within this application's scope.
 *
 * Pagination:
 *   Offset mode  — ?start=0&end=100
 *   Cursor mode  — ?startFrom=<grantId>&limit=100
 *
 * Date filtering: not applicable (AuthzAppAccessGrant has no timestamp).
 * fromDate/toDate are accepted but silently ignored.
 *
 * Auth: appId + appSecret as query params.
 */

import prisma from '@/core/helpers/prisma';
import { logError } from '@/logica/logger/files';
import { cleanupExpiredAccessModel, extractRolePermissionNames } from '@/services/access-model';
import { deriveLegacyRoleScopesFromPolicy, normalizeAuthzScopeFor, normalizeSingleAuthzScopeLevel } from '@/services/applications/authz-scope-policy';

/*
::neup.documentation::application-access-service
::title Application Access Export Service

Builds the paginated access-grant export for an application.

::public

This file owns active-grant filtering, relationship narrowing, pagination, and denormalized permission shaping for access export.

::public end

::private

The route owns the GET versus POST contract. This file owns the query semantics for `accountId` and `forAccount`.

::private end

::end
*/

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationAccessResult =
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
::neup.documentation::get-application-access
::function getApplicationAccess(params)

Returns paginated access-grant export rows for an application.

::public

The function can return the full app-wide export or a narrowed relationship export depending on `accountId` and `forAccount`.

::public end

::private

Only active and nonexpired grants are included. Expired access-model rows are cleaned up before the export query runs.

::private end

::end
*/
export async function getApplicationAccess(params: {
  appId: string | null;
  appSecret: string | null;
  accountId: string | null;
  forAccount: string | null;
  start: string | null;
  end: string | null;
  startFrom: string | null;
  limit: string | null;
  fromDate: string | null;
  toDate: string | null;
}): Promise<ApplicationAccessResult> {
  const { appId, appSecret, accountId, forAccount, start, end, startFrom, limit } = params;

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

    const where: any = {
      accessApplicationId: appId,
      status: 'active',
      AND: [{ OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }] }],
    };

    if (accountId && forAccount) {
      where.AND.push({
        OR: [
          { memberAccountId: accountId, parentAccountId: forAccount },
          { parentAccountId: accountId, memberAccountId: forAccount },
        ],
      });
    } else if (accountId) {
      where.AND.push({
        OR: [
          { memberAccountId: accountId },
          { parentAccountId: accountId },
        ],
      });
    } else if (forAccount) {
      where.parentAccountId = forAccount;
    }

    const { total, grants } = await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      // 3. Count total
      const total = await tx.access.count({ where });

      // 4. Fetch grants with related data
      const grants = await tx.access.findMany({
        where,
        ...(cursorId
          ? { cursor: { id: cursorId }, skip: 1 }
          : { skip }),
        take,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          roleId: true,
          status: true,
          parentAccount: {
            select: {
              id: true,
              displayName: true,
              accountType: true,
            },
          },
          memberAccount: {
            select: {
              id: true,
              displayName: true,
              accountType: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              scopeFor: true,
              scopeLevel: true,
              permissions: true,
            },
          },
        },
      });

      return { total, grants };
    });

    // 5. Shape rows
    const columns = [
      'grantId',
      'status',
      'pushed',
      'accessTo',
      'ownerDisplayName',
      'ownerAccountType',
      'memberId',
      'targetDisplayName',
      'targetAccountType',
      'roleId',
      'roleName',
      'roleDescription',
      'roleScope',
      'permissions',
    ];

    const data = grants.map((g) => ({
      grantId: g.id,
      status: g.status,
      pushed: false,
      accessTo: g.parentAccount?.id ?? null,
      ownerDisplayName: g.parentAccount?.displayName ?? null,
      ownerAccountType: g.parentAccount?.accountType ?? null,
      memberId: g.memberAccount?.id ?? null,
      targetDisplayName: g.memberAccount?.displayName ?? null,
      targetAccountType: g.memberAccount?.accountType ?? null,
      roleId: g.role?.id ?? g.roleId,
      roleName: g.role?.name ?? g.roleId,
      roleDescription: g.role?.description ?? null,
      roleScope: g.role
        ? deriveLegacyRoleScopesFromPolicy(
            normalizeAuthzScopeFor(g.role.scopeFor),
            normalizeSingleAuthzScopeLevel(g.role.scopeLevel),
          )
        : null,
      permissions: extractRolePermissionNames(g.role?.permissions).map((name) => ({
        permissionId: null,
        permissionName: name,
        permissionTag: null,
        denormalized: [name],
      })),
    }));

    const startedAt = grants.length > 0 ? grants[0].id : null;
    const endedAt = grants.length > 0 ? grants[grants.length - 1].id : null;

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
    await logError('auth', error, `application/access:${appId}`);
    return {
      status: 500,
      body: { success: false, error: 'Internal server error.' },
    };
  }
}
