import { NextResponse, type NextRequest } from 'next/server';
import { getApplicationAccess } from '@/services/bridge/application-access';

export const dynamic = 'force-dynamic';

/**
 * GET /bridge/api.v1/application/access
 *
 * Returns access grants (AuthzAppAccessGrant) for the given application —
 * who has been granted what role by whom, with permissions denormalized
 * inline on each role.
 *
 * Auth (required):
 *   appId     — application ID
 *   appSecret — application secret
 *
 * Pagination — choose one mode:
 *   Offset:  ?start=0&end=100          (default: 0–100)
 *   Cursor:  ?startFrom=<grantId>&limit=100
 *
 * Response (200):
 * {
 *   success: true,
 *   columns: string[],
 *   data: [
 *     {
 *       grantId, status,
 *       accessTo, ownerDisplayName, ownerAccountType,
 *       memberId, targetDisplayName, targetAccountType,
 *       roleId, roleName, roleDescription, roleScope,
 *       permissions: [
 *         { permissionId, permissionName, permissionScope, denormalized }
 *       ],
 *       parentPortfolioId
 *     },
 *     ...
 *   ],
 *   meta: {
 *     total: number,
 *     returned: number,
 *     startedAt: string | null,
 *     endedAt: string | null
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }

  if (sp.has('account')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use request body parameters (accountId, forAccount) instead of ?account=...' },
      { status: 400 }
    );
  }

  const result = await getApplicationAccess({
    appId:     sp.get('app'),
    appSecret: sp.get('appSecret'),
    accountId: null,
    forAccount: null,
    start:     sp.get('start'),
    end:       sp.get('end'),
    startFrom: sp.get('startFrom'),
    limit:     sp.get('limit'),
    fromDate:  sp.get('fromDate'),
    toDate:    sp.get('toDate'),
  });

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * POST /bridge/api.v1/application/access?app=[id]
 *
 * Filters access grants for an account by using request body fields (no ?account= query param):
 * - accountId: required — list grants where this account is either:
 *   - the target (access granted to it), or
 *   - the owner (access it granted to others)
 * - forAccount: optional — restrict to grants between accountId and forAccount (either direction)
 *
 * Auth (required query params):
 * - app
 * - appSecret
 */
export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }

  if (sp.has('account')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use request body parameters (accountId, forAccount) instead of ?account=...' },
      { status: 400 }
    );
  }

  let body: { accountId?: string; forAccount?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const accountId = body.accountId?.trim() || null;
  const forAccount = body.forAccount?.trim() || null;

  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'accountId is required' },
      { status: 400 }
    );
  }

  const result = await getApplicationAccess({
    appId: sp.get('app'),
    appSecret: sp.get('appSecret'),
    accountId,
    forAccount,
    start: sp.get('start'),
    end: sp.get('end'),
    startFrom: sp.get('startFrom'),
    limit: sp.get('limit'),
    fromDate: sp.get('fromDate'),
    toDate: sp.get('toDate'),
  });

  return NextResponse.json(result.body, { status: result.status });
}
