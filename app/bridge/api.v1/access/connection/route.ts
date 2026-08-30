import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/.neup/logica/permission';
import { getConnectionMembers } from '@/services/bridge/connection-members';

const routePermissions = [
  permission('access.connection.view.self', 'for_individual', 'api'),
];

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::access-connection-route-module
 * ::title Access Connection Route Module
 *
 * Exposes the bridge endpoint for reading the members attached to one connection.
 *
 * ::public
 *
 * This module accepts GET query parameters or POST JSON body parameters and returns the normalized response from the connection-members bridge service.
 *
 * ::public end
 *
 * ::private
 *
 * The helpers in this file only normalize auth and parameter inputs before delegating to `getConnectionMembers()`. Authorization and data loading stay in the service layer.
 *
 * ::private end
 *
 * ::end
 */
function getAuthToken(request: NextRequest): string | null {
  /**
   * ::neup.documentation::access-connection-route-get-auth-token
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

function getConnectionId(searchParams: URLSearchParams, body?: Record<string, unknown>): string | null {
  /**
   * ::neup.documentation::access-connection-route-get-connection-id
   * ::function getConnectionId(searchParams, body)
   *
   * Normalizes the requested connection identifier from body or query parameters.
   *
   * ::public
   *
   * Accepts both `connection` and `connectionId`, with JSON body values taking precedence over query-string values.
   *
   * ::public end
   *
   * ::private
   *
   * This helper keeps legacy-compatible input aliases at the HTTP layer instead of leaking them into the service contract.
   *
   * ::private end
   *
   * ::end
   */
  const bodyConnection =
    typeof body?.connection === 'string'
      ? body.connection
      : typeof body?.connectionId === 'string'
      ? body.connectionId
      : null;

  return bodyConnection?.trim() || searchParams.get('connection') || searchParams.get('connectionId');
}

function getProfileAccountId(searchParams: URLSearchParams, body?: Record<string, unknown>): string | null {
  /**
   * ::neup.documentation::access-connection-route-get-profile-account-id
   * ::function getProfileAccountId(searchParams, body)
   *
   * Normalizes the optional managed-profile account ID from body or query parameters.
   *
   * ::public
   *
   * Accepts both `profile` and `profileAccountId`, with JSON body values taking precedence over query-string values.
   *
   * ::public end
   *
   * ::private
   *
   * The helper returns `null` when no managed-profile target is supplied so the service can default to the requester account.
   *
   * ::private end
   *
   * ::end
   */
  const bodyProfile =
    typeof body?.profile === 'string'
      ? body.profile
      : typeof body?.profileAccountId === 'string'
      ? body.profileAccountId
      : null;

  return bodyProfile?.trim() || searchParams.get('profile') || searchParams.get('profileAccountId');
}

async function handle(request: NextRequest, body?: Record<string, unknown>) {
  /**
   * ::neup.documentation::access-connection-route-handle
   * ::function handle(request, body)
   *
   * Dispatches a normalized connection-member lookup and returns its HTTP response.
   *
   * ::public
   *
   * Shared by both GET and POST variants so they return the same payload and status codes.
   *
   * ::public end
   *
   * ::private
   *
   * This helper is intentionally thin: it extracts normalized parameters and passes them straight into `getConnectionMembers()`.
   *
   * ::private end
   *
   * ::end
   */
  const searchParams = request.nextUrl.searchParams;
  const result = await getConnectionMembers({
    connectionId: getConnectionId(searchParams, body),
    profileAccountId: getProfileAccountId(searchParams, body),
    authToken: getAuthToken(request),
  });

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * ::neup.documentation::access-connection-endpoint
 * ::api GET /bridge/api.v1/access/connection
 *
 * Returns the accounts associated with a specific connection.
 *
 * ::public
 *
 * Use this endpoint from first-party account-aware surfaces when you need the members and roles attached to one application connection for the current or managed profile.
 *
 * ::public end
 *
 * ::private
 *
 * The HTTP contract lives here. Authentication, permission checks, connection ownership checks, and member shaping are implemented in `services/bridge/connection-members.ts`.
 *
 * ::private end
 *
 * ::param external connection
 * ::datatype string
 * ::required true
 *
 * Connection identifier to inspect. `connectionId` is also accepted.
 *
 * ::param external profile
 * ::datatype string
 * ::required false
 *
 * Optional managed-profile account ID. `profileAccountId` is also accepted.
 *
 * ::details
 *
 * The caller must supply a valid `auth` header or `auth_account` cookie and must hold `access.connection.view` on the requested profile.
 *
 * ::end
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

/**
 * ::neup.documentation::access-connection-post-endpoint
 * ::api POST /bridge/api.v1/access/connection
 *
 * Returns the accounts associated with a specific connection using JSON body parameters.
 *
 * ::public
 *
 * Use this variant when the caller prefers sending `connection` and `profile` in a request body instead of query params.
 *
 * ::public end
 *
 * ::private
 *
 * Request-body validation and parameter normalization live here; data retrieval is delegated to `getConnectionMembers()`.
 *
 * ::private end
 *
 * ::param external connection
 * ::datatype string
 * ::required true
 *
 * Connection identifier to inspect. `connectionId` is also accepted.
 *
 * ::param external profile
 * ::datatype string
 * ::required false
 *
 * Optional managed-profile account ID. `profileAccountId` is also accepted.
 *
 * ::details
 *
 * The caller must supply a valid `auth` header or `auth_account` cookie and must hold `access.connection.view` on the requested profile.
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

  return handle(request, body as Record<string, unknown>);
}
