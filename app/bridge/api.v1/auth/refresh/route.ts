import { NextResponse, type NextRequest } from 'next/server';
import { bridgeRefreshSessionExpiry } from '@/services/auth/session';

/**
 * ::neup.documentation::bridge-auth-refresh-endpoint
 * ::api POST /bridge/api.v1/auth/refresh
 *
 * Refreshes the currently active cookie-backed session expiry.
 *
 * ::public
 *
 * Use this endpoint when a signed-in first-party session needs expiry extension without passing an explicit session triplet.
 *
 * ::public end
 *
 * ::private
 *
 * The route delegates all session lookup and refresh behavior to `bridgeRefreshSessionExpiry()`.
 *
 * ::private end
 *
 * ::end
 */
export async function POST(request: NextRequest) {
    const result = await bridgeRefreshSessionExpiry();
    return NextResponse.json(result.body, { status: result.status });
}
