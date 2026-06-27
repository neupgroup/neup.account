
import { NextRequest, NextResponse } from 'next/server';
import { bridgeInvalidateSession, bridgeValidateAndRefreshSession } from '@/services/auth/session';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-session-post-endpoint
 * ::api POST /bridge/api.v1/auth/session
 *
 * Validates and refreshes a bridge session.
 *
 * ::public
 *
 * Use this endpoint for internal keepalive behavior with the `aid/sid/skey` session triplet.
 *
 * ::public end
 *
 * ::private
 *
 * The route owns JSON parsing only; session validation and expiry extension are delegated to `bridgeValidateAndRefreshSession()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * POST /api.v1/auth/session
 * Validates a session, updates device type, and extends expiry.
 * Used for internal Neup.Account session management.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeValidateAndRefreshSession(body);
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::bridge-auth-session-delete-endpoint
 * ::api DELETE /bridge/api.v1/auth/session
 *
 * Invalidates a bridge session.
 *
 * ::public
 *
 * Use this endpoint for internal logout with the `aid/sid/skey` session triplet.
 *
 * ::public end
 *
 * ::private
 *
 * Session invalidation behavior is delegated to `bridgeInvalidateSession()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * DELETE /api.v1/auth/session
 * Invalidates a session (logout).
 */
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeInvalidateSession(body);
  return NextResponse.json(result.body, { status: result.status });
}
