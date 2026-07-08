import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/logica/permission';
import { getSyncedAppRoles, postSyncedAppRoles } from '@/services/bridge/app-authz-sync';

const routePermissions = [
  permission('application.roles.view', 'for_individual', 'application'),
  permission('application.roles.manage', 'for_individual', 'application'),
];

export const dynamic = 'force-dynamic';

/*
::neup.documentation::app-roles-sync-endpoint
::api GET /bridge/api.v1/app/roles
::api POST /bridge/api.v1/app/roles

Exports or imports the role catalog for one app.

::public

Callers must provide `neup_app_id` and `neup_app_secret`. Role and permission IDs may contain only `0-9`, `a-z`, `A-Z`, `.`, `-`, and `_`.

::public end

::private

POST resolves role permission names against the app permission catalog, so clients should post permissions before posting roles.

::private end

::end
*/

function readCredentials(request: NextRequest, body?: Record<string, unknown>) {
  return {
    neupAppId:
      (typeof body?.neup_app_id === 'string' ? body.neup_app_id : null) ??
      request.nextUrl.searchParams.get('neup_app_id') ??
      request.headers.get('neup-app-id'),
    neupAppSecret:
      (typeof body?.neup_app_secret === 'string' ? body.neup_app_secret : null) ??
      request.nextUrl.searchParams.get('neup_app_secret') ??
      request.headers.get('neup-app-secret'),
  };
}

export async function GET(request: NextRequest) {
  const result = await getSyncedAppRoles(readCredentials(request));
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const bodyObject = Array.isArray(body) ? undefined : body as Record<string, unknown>;
  const input = bodyObject && 'roles' in bodyObject ? bodyObject.roles : body;
  const result = await postSyncedAppRoles(readCredentials(request, bodyObject), input);
  return NextResponse.json(result.body, { status: result.status });
}
