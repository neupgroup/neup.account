import { NextResponse, type NextRequest } from 'next/server';
import { bridgeSignIntoApplication } from '@/services/auth/sign';

/**
 * ::neup.documentation::bridge-auth-sign-endpoint
 * ::api POST /bridge/api.v1/auth/sign
 *
 * Signs a validated account into an application context.
 *
 * ::public
 *
 * Use this endpoint when a trusted application needs a bridge-mediated sign-in response for an app.
 *
 * ::public end
 *
 * ::private
 *
 * The route delegates app-specific sign-in behavior to `bridgeSignIntoApplication()`.
 *
 * ::private end
 *
 * ::end
 */
export async function POST(request: NextRequest) {
    const body = await request.json();
    const result = await bridgeSignIntoApplication(body);
    return NextResponse.json(result.body, { status: result.status });
}
