/**
 * services/bridge/application-users.ts
 *
 * Returns accounts (users) that have an ApplicationConnection to the given app.
 *
 * Pagination:
 *   Offset mode  — ?start=0&end=100
 *   Cursor mode  — ?startFrom=<connectionId>&limit=100
 *
 * Date filtering:
 *   ?fromDate=2025-01-01&toDate=2026-01-01  (filters on ApplicationConnection.connectedAt)
 *
 * Auth: appId + appSecret as query params (same pattern as /accounts/lookup).
 */

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationUsersResult =
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

export async function getApplicationUsers(params: {
  appId: string | null;
  appSecret: string | null;
  start: string | null;
  end: string | null;
  startFrom: string | null;
  limit: string | null;
  fromDate: string | null;
  toDate: string | null;
}): Promise<ApplicationUsersResult> {
  const { appId, appSecret, start, end, startFrom, limit, fromDate, toDate } = params;

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

    // 2. Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (!isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      if (!isNaN(d.getTime())) dateFilter.lte = d;
    }

    const connectedAtFilter = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    // 3. Resolve pagination
    let take: number;
    let skip: number | undefined;
    let cursorId: string | undefined;

    if (startFrom) {
      // Cursor-based pagination
      take = clampLimit(limit);
      cursorId = startFrom;
    } else {
      // Offset-based pagination
      const startIdx = start ? parseInt(start, 10) : 0;
      const endIdx = end ? parseInt(end, 10) : PAGE_LIMIT;
      skip = Number.isFinite(startIdx) && startIdx >= 0 ? startIdx : 0;
      take = Number.isFinite(endIdx) && endIdx > skip ? Math.min(endIdx - skip, PAGE_LIMIT) : PAGE_LIMIT;
    }

    // 4. Count total (for meta)
    const total = await prisma.connection.count({
      where: {
        appId,
        ...(connectedAtFilter ? { connectedAt: connectedAtFilter } : {}),
      },
    });

    // 5. Fetch connections with account data
    const connections = await prisma.connection.findMany({
      where: {
        appId,
        ...(connectedAtFilter ? { connectedAt: connectedAtFilter } : {}),
      },
      ...(cursorId
        ? { cursor: { id: cursorId }, skip: 1 }
        : { skip }),
      take,
      orderBy: { connectedAt: 'asc' },
      select: {
        id: true,
        accountId: true,
        status: true,
        connectedAt: true,
        account: {
          select: {
            id: true,
            displayName: true,
            displayImage: true,
            accountType: true,
            isVerified: true,
            createdAt: true,
            neupIds: {
              where: { isPrimary: true },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    // 6. Shape rows
    const columns = [
      'connectionId',
      'accountId',
      'neupId',
      'displayName',
      'displayImage',
      'accountType',
      'isVerified',
      'accountCreatedAt',
      'connectedAt',
      'connectionStatus',
    ];

    const data = connections.map((c) => ({
      connectionId: c.id,
      accountId: c.account.id,
      neupId: c.account.neupIds[0]?.id ?? null,
      displayName: c.account.displayName,
      displayImage: c.account.displayImage,
      accountType: c.account.accountType,
      isVerified: c.account.isVerified,
      accountCreatedAt: c.account.createdAt.toISOString(),
      connectedAt: c.connectedAt.toISOString(),
      connectionStatus: c.status,
    }));

    const startedAt = connections.length > 0 ? connections[0].id : null;
    const endedAt = connections.length > 0 ? connections[connections.length - 1].id : null;

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
    await logError('auth', error, `application/users:${appId}`);
    return {
      status: 500,
      body: { success: false, error: 'Internal server error.' },
    };
  }
}
