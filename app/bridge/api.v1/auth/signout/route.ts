import { NextResponse, type NextRequest } from 'next/server';
import { bridgeSignoutExternalSession } from '@/services/auth/signout';

/**
 * ::neup.documentation::bridge-auth-signout-endpoint
 * ::api POST /bridge/api.v1/auth/signout
 *
 * Invalidates an external application session value.
 *
 * ::public
 *
 * Use this endpoint when an external app wants Neup.Account to expire the app session it previously received.
 *
 * ::public end
 *
 * ::private
 *
 * The route delegates session invalidation behavior to `bridgeSignoutExternalSession()`.
 *
 * ::private end
 *
 * ::end
 */
export async function POST(request: NextRequest) {
    const body = await request.json();
    const result = await bridgeSignoutExternalSession(body);
    return NextResponse.json(result.body, { status: result.status });
}
