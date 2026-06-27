import { NextRequest, NextResponse } from 'next/server';
import { bridgeValidateToken } from '@/services/auth/bridgeToken';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-validate-endpoint
 * ::api POST /bridge/api.v1/auth/validate
 *
 * Validates a first-party or app-scoped auth token.
 *
 * ::public
 *
 * If `app` is provided, the token is treated as an external-app HS256 token. Without `app`, the token is treated as the base account token.
 *
 * ::public end
 *
 * ::private
 *
 * The route owns JSON parsing and `app` versus `appId` validation, then delegates to `bridgeValidateToken()`.
 *
 * ::private end
 *
 * ::param external token
 * ::datatype string
 * ::required true
 *
 * Token to validate.
 *
 * ::end
 */
/**
 * POST /bridge/api.v1/auth/validate
 *
 * Validates an auth token.
 *
 * - If `?app=` is provided: treats `token` as an external-app HS256 JWT signed with Application.appSecret.
 * - If `?app=` is omitted: treats `token` as the base account RS256 auth_account token (first-party).
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

  const result = await bridgeValidateToken({
    token: body.token,
    app: sp.get('app') ?? undefined,
  });

  return NextResponse.json(result.body, { status: result.status });
}
