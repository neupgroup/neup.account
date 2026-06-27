import { NextRequest, NextResponse } from 'next/server';
import { issueAccountToken } from '@/services/auth/accountJwt';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-token-endpoint
 * ::api POST /bridge/api.v1/auth/token
 *
 * Issues an application bearer token from a validated session triplet.
 *
 * ::public
 *
 * The issued token is app-scoped and can be used with bearer-token bridge APIs.
 *
 * ::public end
 *
 * ::private
 *
 * The route owns JSON parsing and `app` versus `appId` validation, then delegates to `issueAccountToken()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * POST /account/bridge/api.v1/auth/token
 *
 * Issues a signed JWT for external API access.
 *
 * Called after the silent auth flow completes and the caller has the user's
 * aid, sid, and skey (from the silent auth code exchange or session cookies).
 *
 * The issued JWT contains only { cid, iat, exp }:
 *   cid — ApplicationConnection.id (stable link between account and app)
 *   iat — issued-at Unix timestamp
 *   exp — expiry Unix timestamp (7 days from issue)
 *
 * The JWT is signed with Application.appSecret (HS256).
 * Pass it as a Bearer token to POST /account/bridge/api.v1/me.
 *
 * Request body:
 * {
 *   aid:   string  — account ID
 *   sid:   string  — session ID
 *   skey:  string  — session key
 *   appId: string  — application ID
 * }
 *
 * Response (200):
 * {
 *   success: true,
 *   token:   string  — signed JWT  { cid, iat, exp }
 *   exp:     number  — Unix timestamp when the token expires
 * }
 *
 * Errors: 400 (missing params), 401 (invalid session), 404 (app not found), 500
 */
export async function POST(request: NextRequest) {
  let body: { aid?: string; sid?: string; skey?: string; app?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  if ((body as any).appId) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }

  const result = await issueAccountToken({
    aid: body.aid,
    sid: body.sid,
    skey: body.skey,
    appId: body.app,
  });
  return NextResponse.json(result.body, { status: result.status });
}
