
import { NextRequest, NextResponse } from 'next/server';
import { bridgeCheckGrant, bridgeIssueGrant, bridgeRefreshGrant } from '@/services/auth/grant';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-grant-post-endpoint
 * ::api POST /bridge/api.v1/auth/grant
 *
 * Exchanges a one-time grant token for an external app session.
 *
 * ::public
 *
 * Use this endpoint after the redirect handshake callback returns a `tempToken`.
 *
 * ::public end
 *
 * ::private
 *
 * The exchange behavior is implemented in `bridgeIssueGrant()`.
 *
 * ::private end
 *
 * ::end
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeIssueGrant(body);
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::bridge-auth-grant-patch-endpoint
 * ::api PATCH /bridge/api.v1/auth/grant
 *
 * Refreshes an external app grant.
 *
 * ::public
 *
 * Supports token-based refresh and session-based refresh for an app grant.
 *
 * ::public end
 *
 * ::private
 *
 * Refresh semantics are implemented in `bridgeRefreshGrant()`.
 *
 * ::private end
 *
 * ::end
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRefreshGrant(body);
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::bridge-auth-grant-get-endpoint
 * ::api GET /bridge/api.v1/auth/grant
 *
 * Checks whether an external app grant is still valid.
 *
 * ::public
 *
 * Use this endpoint when you need to confirm that an app grant session is still active.
 *
 * ::public end
 *
 * ::private
 *
 * The route rejects `appId` and delegates the validity check to `bridgeCheckGrant()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * GET /api.v1/auth/grant
 * Checks if the authentication grant is still valid.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  if (searchParams.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }
  const result = await bridgeCheckGrant({
    aid: searchParams.get('aid') ?? undefined,
    sid: searchParams.get('sid') ?? undefined,
    skey: searchParams.get('skey') ?? undefined,
    app: searchParams.get('app') ?? undefined,
  });
  return NextResponse.json(result.body, { status: result.status });
}
