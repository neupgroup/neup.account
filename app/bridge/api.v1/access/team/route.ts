import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/neup.logica/permission';
import { getApplicationTeamMembers } from '@/services/bridge/application-team';

const routePermissions = [
  permission('access.view', 'for_individual', 'api'),
  permission('access.team.view', 'for_individual', 'api'),
];

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::access-team-route-module
 * ::title Access Team Route Module
 *
 * Exposes the bridge endpoint for reading the members attached to one application team.
 *
 * ::public
 *
 * This module accepts GET query parameters or POST JSON body parameters and returns the normalized response from the application-team bridge service.
 *
 * ::public end
 *
 * ::private
 *
 * The route owns request-shape validation and alias handling only. Authentication, permission checks, and member aggregation live in `services/bridge/application-team.ts`.
 *
 * ::private end
 *
 * ::end
 */
function getAuthToken(request: NextRequest): string | null {
  /**
   * ::neup.documentation::access-team-route-get-auth-token
   * ::function getAuthToken(request)
   *
   * Resolves the account auth token from the request.
   *
   * ::public
   *
   * The route accepts either the `auth` header or the `auth_account` cookie.
   *
   * ::public end
   *
   * ::private
   *
   * Header auth takes precedence so callers can override cookie state explicitly.
   *
   * ::private end
   *
   * ::end
   */
  const headerToken = request.headers.get('auth')?.trim();
  if (headerToken) {
    return headerToken;
  }

  const cookieToken = request.cookies.get('auth_account')?.value?.trim();
  return cookieToken || null;
}

async function handle(
  request: NextRequest,
  body?: { app?: string; profile?: string },
) {
  /**
   * ::neup.documentation::access-team-route-handle
   * ::function handle(request, body)
   *
   * Dispatches a normalized application-team lookup and returns its HTTP response.
   *
   * ::public
   *
   * Shared by both GET and POST variants so they enforce the same parameter aliases, validation rules, and response codes.
   *
   * ::public end
   *
   * ::private
   *
   * The helper rejects the legacy `appId` query key to keep the external contract aligned with the current `app` parameter name.
   *
   * ::private end
   *
   * ::end
   */
  const searchParams = request.nextUrl.searchParams;

  if (searchParams.has('appId')) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_request',
        error_description: 'Use `app` (not `appId`).',
      },
      { status: 400 },
    );
  }

  const appId = body?.app?.trim() || searchParams.get('app');
  const profileAccountId = body?.profile?.trim() || searchParams.get('profile');
  const authToken = getAuthToken(request);

  const result = await getApplicationTeamMembers({
    appId,
    authToken,
    profileAccountId,
  });

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::access-team-endpoint
 * ::api GET /bridge/api.v1/access/team
 *
 * Returns the members and granted roles attached to one application for the current or managed profile.
 *
 * ::public
 *
 * Use this endpoint when a first-party surface needs the team roster for an application connection space.
 *
 * ::public end
 *
 * ::private
 *
 * The route keeps the HTTP contract small and forwards the actual authorization and data shaping to `getApplicationTeamMembers()`.
 *
 * ::private end
 *
 * ::param external app
 * ::datatype string
 * ::required true
 *
 * Application identifier to inspect.
 *
 * ::param external profile
 * ::datatype string
 * ::required false
 *
 * Optional managed-profile account ID to query instead of the requester account.
 *
 * ::end
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

/**
 * ::neup.documentation::access-team-post-endpoint
 * ::api POST /bridge/api.v1/access/team
 *
 * Returns the members and granted roles attached to one application using JSON body parameters.
 *
 * ::public
 *
 * Use this variant when the caller prefers sending `app` and `profile` in a request body instead of query params.
 *
 * ::public end
 *
 * ::private
 *
 * Body parsing errors return `400` before the service layer is reached so malformed requests never hit authz or database code.
 *
 * ::private end
 *
 * ::param external app
 * ::datatype string
 * ::required true
 *
 * Application identifier to inspect.
 *
 * ::param external profile
 * ::datatype string
 * ::required false
 *
 * Optional managed-profile account ID to query instead of the requester account.
 *
 * ::end
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_request',
        error_description: 'Request body must be a JSON object.',
      },
      { status: 400 },
    );
  }

  return handle(request, body as { app?: string; profile?: string });
}
