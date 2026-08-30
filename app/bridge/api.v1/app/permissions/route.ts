import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/.neup/logica/permission';
import { getSyncedAppPermissions, postSyncedAppPermissions } from '@/services/bridge/app-authz-sync';

const routePermissions = [
  permission('application.roles.view', 'for_individual', 'application'),
  permission('application.roles.manage', 'for_individual', 'application'),
];

export const dynamic = 'force-dynamic';

/*
::neup.documentation::app-permissions-sync-endpoint
::api GET /bridge/api.v1/app/permissions
::api POST /bridge/api.v1/app/permissions

Exports or imports the permission catalog for one app.

::public

Callers must provide `neup_app_id` and `neup_app_secret`. `GET` accepts them in the query string or headers; `POST` accepts them in the JSON body, query string, or headers.

::public end

::private

The route delegates validation and persistence to `services/bridge/app-authz-sync.ts`.

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
  const result = await getSyncedAppPermissions(readCredentials(request));
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
  const input = bodyObject && 'permissions' in bodyObject ? bodyObject.permissions : body;
  const result = await postSyncedAppPermissions(readCredentials(request, bodyObject), input);
  return NextResponse.json(result.body, { status: result.status });
}
