import { NextResponse, type NextRequest } from 'next/server';
import { bridgeEnrollPublicRole } from '@/services/bridge/roles-enroll';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::bridge-roles-enroll-endpoint
 * ::api POST /bridge/api.v1/roles/enroll
 *
 * Enrolls one account or connection into a publicly-enrollable application role.
 *
 * ::public
 *
 * Send `appSecret`, `roleId`, and either `accountId` or `connectionId` in the JSON body. When the target role allows immediate public enrollment, the route assigns it directly; otherwise it returns the pending request created by the shared role-assignment flow.
 *
 * ::public end
 *
 * ::private
 *
 * The route only owns JSON parsing and HTTP response shaping. Application-secret validation, target resolution, and enrollment logic live in `services/bridge/roles-enroll.ts`.
 *
 * ::private end
 *
 * ::param external appSecret
 * ::datatype string
 * ::required true
 *
 * Shared secret for the target application.
 *
 * ::param external accountId
 * ::datatype string
 * ::required false
 *
 * Account identifier to enroll when the app secret resolves one application unambiguously.
 *
 * ::param external connectionId
 * ::datatype string
 * ::required false
 *
 * Existing connection identifier. Use this to disambiguate duplicate app secrets or to reuse an existing connection target.
 *
 * ::param external roleId
 * ::datatype string
 * ::required true
 *
 * Role identifier to enroll into.
 *
 * ::details
 *
 * This route returns `400` for invalid JSON or missing inputs, `401` for invalid app secrets, `403` for blocked applications or disallowed role scopes, `404` for missing resources, `409` for ambiguous or conflicting identifiers, `200` for immediate assignment, and `202` when an approval request is created.
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

  const payload = body as Record<string, unknown>;
  const result = await bridgeEnrollPublicRole({
    appSecret: typeof payload.appSecret === 'string' ? payload.appSecret : null,
    accountId: typeof payload.accountId === 'string' ? payload.accountId : null,
    connectionId: typeof payload.connectionId === 'string' ? payload.connectionId : null,
    roleId: typeof payload.roleId === 'string' ? payload.roleId : null,
  });

  return NextResponse.json(result.body, { status: result.status });
}
