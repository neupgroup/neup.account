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
import { logError } from '@/core/helpers/logger';

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

    // Filtering semantics (when accountId is provided):
    // - include BOTH directions:
    //   A) grants that were granted TO the account (targetAccountId = accountId)
    //   B) grants that the account granted to others (ownerAccountId = accountId)
    // This intentionally does not filter by portfolioId (portfolio or non-portfolio grants are included).
    const where: any = { appId };

    if (accountId && forAccount) {
      where.OR = [
        { targetAccountId: accountId, ownerAccountId: forAccount },
        { ownerAccountId: accountId, targetAccountId: forAccount },
      ];
    } else if (accountId) {
      where.OR = [
        { targetAccountId: accountId },
        { ownerAccountId: accountId },
      ];
    } else if (forAccount) {
      // If only forAccount is provided, treat it as a strict owner filter.
      where.ownerAccountId = forAccount;
    }

    // Unpushed only
    where.pushed = false;

    const { total, grants } = await prisma.$transaction(async (tx) => {
      // 3. Count total (unpushed only)
      const total = await tx.authzAppAccessGrant.count({ where });

      // 4. Fetch grants with related data (unpushed only)
      const grants = await tx.authzAppAccessGrant.findMany({
        where,
        ...(cursorId
          ? { cursor: { id: cursorId }, skip: 1 }
          : { skip }),
        take,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          status: true,
          pushed: true,
          portfolioId: true,
          account: {
            select: {
              id: true,
              displayName: true,
              accountType: true,
            },
          },
          targetAccount: {
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
              scope: true,
              roleMaps: {
                select: {
                  permission: {
                    select: {
                      id: true,
                      name: true,
                      scope: true,
                    },
                  },
                  denormalizedPermission: true,
                },
              },
            },
          },
        },
      });

      // Mark returned grants as pushed
      if (grants.length > 0) {
        await tx.authzAppAccessGrant.updateMany({
          where: { appId, id: { in: grants.map((g) => g.id) } },
          data: { pushed: true },
        });
      }

      return { total, grants };
    });

    // 5. Shape rows
    const columns = [
      'grantId',
      'status',
      'pushed',
      'ownerAccountId',
      'ownerDisplayName',
      'ownerAccountType',
      'targetAccountId',
      'targetDisplayName',
      'targetAccountType',
      'roleId',
      'roleName',
      'roleDescription',
      'roleScope',
      'permissions',
      'portfolioId',
    ];

    const data = grants.map((g) => ({
      grantId: g.id,
      status: g.status,
      pushed: true,
      ownerAccountId: g.account.id,
      ownerDisplayName: g.account.displayName,
      ownerAccountType: g.account.accountType,
      targetAccountId: g.targetAccount.id,
      targetDisplayName: g.targetAccount.displayName,
      targetAccountType: g.targetAccount.accountType,
      roleId: g.role.id,
      roleName: g.role.name,
      roleDescription: g.role.description,
      roleScope: g.role.scope,
      permissions: g.role.roleMaps.map((m) => ({
        permissionId: m.permission.id,
        permissionName: m.permission.name,
        permissionScope: m.permission.scope,
        denormalized: m.denormalizedPermission ?? null,
      })),
      portfolioId: g.portfolioId,
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
