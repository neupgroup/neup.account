import { NextResponse, type NextRequest } from 'next/server';
import { checkSession } from '@/services/account/check';

/*
::neup.documentation::bridge-auth-me-route
::title Current Account Session Endpoint
::api GET /bridge/api.v1/auth/me

::public

Returns the current signed-in account profile snapshot, permission names, active account id, and personal account id for the client session provider.

::public end

::private

The route delegates all session validation and permission resolution to `services/account/check.ts`. Invalid or missing sessions return `401` instead of redirecting so client components can decide how to handle auth state.

::private end

::end
*/

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const workingProfile = request.nextUrl.searchParams.get('workingProfile');
    const result = await checkSession(workingProfile);

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        profileInfo: result.profileInfo,
        permissions: result.permissions,
        accountId: result.accountId,
        personalAccountId: result.personalAccountId,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'internal_server_error' },
      { status: 500 },
    );
  }
}
