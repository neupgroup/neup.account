import { NextRequest, NextResponse } from 'next/server';
import { bridgeExpireToken } from '@/services/auth/bridgeToken';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-expire-endpoint
 * ::api POST /bridge/api.v1/auth/expire
 *
 * Expires a first-party or app-scoped auth token.
 *
 * ::public
 *
 * If `app` is provided, the token is treated as an external-app HS256 token. Without `app`, the token is treated as the base account token.
 *
 * ::public end
 *
 * ::private
 *
 * The route owns JSON parsing and `app` versus `appId` validation, then delegates to `bridgeExpireToken()`.
 *
 * ::private end
 *
 * ::param external token
 * ::datatype string
 * ::required true
 *
 * Token to expire.
 *
 * ::end
 */
/**
 * POST /bridge/api.v1/auth/expire
 *
 * Expires the session associated with the provided token.
 *
 * - If `?app=` is provided: token is treated as an external-app HS256 JWT (signed with Application.appSecret).
 * - If `?app=` is omitted: token is treated as the base account RS256 auth_account token (first-party).
 *
 * Body: { token }
 */
export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const result = await bridgeExpireToken({
    token: body.token,
    app: sp.get('app') ?? undefined,
  });

  return NextResponse.json(result.body, { status: result.status });
}
