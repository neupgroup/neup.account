/**
 * services/bridge/application-users.ts
 *
 * Returns accounts (users) that have an ApplicationConnection to the given app.
 *
 * Pagination:
 *   Offset mode  — ?offset=0&limit=100 (also supports legacy ?start=0&end=100)
 *   Cursor mode  — ?startFrom=<connectionId>&limit=100
 *
 * Date filtering:
 *   ?fromDate=2025-01-01&toDate=2026-01-01  (filters on ApplicationConnection.connectedAt)
 *
 * Auth: appId + appSecret as query params (same pattern as /accounts/lookup).
 */

import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { extractGenderFromDetails, resolveDisplayImage } from '@/inapp/display-image';

/*
::neup.documentation::application-users-service
::title Application Users Export Service

Builds the paginated connected-user export for an application.

::public

This file owns pagination, date filtering, profile shaping, and response-row structure for the application users export.

::public end

::private

The route file owns the HTTP/body/origin contract. This file owns credential checks and export semantics.

::private end

::end
*/

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
      body: { success: false; error: string };
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
::neup.documentation::get-application-users
::function getApplicationUsers(params)

Returns paginated connected-user export rows for an application.

::public

Supports both offset and cursor pagination, plus optional `connectedAt` date filtering.

::public end

::private

The implementation validates app credentials, counts matching connections, joins account profile fields, and returns stable column metadata for downstream consumers.

::private end

::end
*/
export async function getApplicationUsers(params: {
  appId: string | null;
  appSecret: string | null;
  offset: string | null;
  start: string | null;
  end: string | null;
  startFrom: string | null;
  limit: string | null;
  fromDate: string | null;
  toDate: string | null;
}): Promise<ApplicationUsersResult> {
  const { appId, appSecret, offset, start, end, startFrom, limit, fromDate, toDate } = params;

  // 1. Validate credentials
  if (!appId || !appSecret) {
    return {
      status: 400,
      body: { success: false, error: 'forbidden_missingAppCredentails' },
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
        body: { success: false, error: 'forbidden_invalidAppCredentials' },
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
      const offsetRaw = offset ?? start;
      const startIdx = offsetRaw ? parseInt(offsetRaw, 10) : 0;
      skip = Number.isFinite(startIdx) && startIdx >= 0 ? startIdx : 0;

      if (limit) {
        take = clampLimit(limit);
      } else {
        const endIdx = end ? parseInt(end, 10) : PAGE_LIMIT;
        take = Number.isFinite(endIdx) && endIdx > skip ? Math.min(endIdx - skip, PAGE_LIMIT) : PAGE_LIMIT;
      }
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
            details: true,
            isVerified: true,
            createdAt: true,
            individualProfile: {
              select: {
                details: true,
              },
            },
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

    const data = connections.map((c) => {
      const gender = extractGenderFromDetails({
        accountDetails: c.account.details,
        individualDetails: c.account.individualProfile?.details,
      });
      return ({
      connectionId: c.id,
      accountId: c.account.id,
      neupId: c.account.neupIds[0]?.id ?? null,
      displayName: c.account.displayName,
      displayImage: resolveDisplayImage({
        displayImage: c.account.displayImage,
        accountType: c.account.accountType,
        gender,
      }),
      accountType: c.account.accountType,
      isVerified: c.account.isVerified,
      accountCreatedAt: c.account.createdAt.toISOString(),
      connectedAt: c.connectedAt.toISOString(),
      connectionStatus: c.status,
    });
    });

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
