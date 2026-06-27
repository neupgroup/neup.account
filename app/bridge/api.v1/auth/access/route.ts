
import { NextRequest, NextResponse } from 'next/server';
import { bridgeCreateAuthAccess, bridgeGetAuthAccess, bridgeUpdateAuthAccess } from '@/services/auth/access';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-auth-access-get-endpoint
 * ::api GET /bridge/api.v1/auth/access
 *
 * Returns the auth access snapshot for an account and app scope.
 *
 * ::public
 *
 * Use this endpoint to fetch the current role and permission snapshot derived from the shared access model.
 *
 * ::public end
 *
 * ::private
 *
 * The route rejects `appId` and delegates snapshot resolution to `services/auth/access.ts`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * GET /bridge/api.v1/auth/access
 * Retrieves roles, permissions, and team information for a user.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  if (searchParams.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }
  const result = await bridgeGetAuthAccess({
    aid: searchParams.get('aid'),
    sid: searchParams.get('sid'),
    skey: searchParams.get('skey'),
    appId: searchParams.get('app'),
  });
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::bridge-auth-access-post-endpoint
 * ::api POST /bridge/api.v1/auth/access
 *
 * Creates the default auth access-member grant for a recipient.
 *
 * ::public
 *
 * Use this endpoint to add a recipient into the auth access model.
 *
 * ::public end
 *
 * ::private
 *
 * The grant mutation is implemented in `bridgeCreateAuthAccess()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * POST /bridge/api.v1/auth/access
 * Adds a user to the auth team (Admin/Manager role).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeCreateAuthAccess(body);
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::bridge-auth-access-patch-endpoint
 * ::api PATCH /bridge/api.v1/auth/access
 *
 * Adds or removes auth access roles for a recipient.
 *
 * ::public
 *
 * Use this endpoint to mutate app-scoped auth access roles through `add` and `remove`.
 *
 * ::public end
 *
 * ::private
 *
 * The route is thin by design and delegates mutation semantics to `bridgeUpdateAuthAccess()`.
 *
 * ::private end
 *
 * ::end
 */
/**
 * PATCH /bridge/api.v1/auth/access
 * Updates roles, user permissions, or asset permissions.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeUpdateAuthAccess(body);
  return NextResponse.json(result.body, { status: result.status });
}
