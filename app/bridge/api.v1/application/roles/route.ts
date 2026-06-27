import { NextResponse, type NextRequest } from 'next/server';
import { getApplicationRoles } from '@/services/bridge/application-roles';

export const dynamic = 'force-dynamic';

/**
 * ::neup.documentation::application-roles-endpoint
 * ::api GET /bridge/api.v1/application/roles
 *
 * Returns application roles with inline permission data.
 *
 * ::public
 *
 * Use this endpoint from an application backend when you need the current role catalog for an app.
 *
 * ::public end
 *
 * ::private
 *
 * This route owns the query contract. Pagination and denormalized permission shaping are delegated to `services/bridge/application-roles.ts`.
 *
 * ::private end
 *
 * ::param external app
 * ::datatype string
 * ::required true
 *
 * Application identifier. `appId` is rejected.
 *
 * ::param external appSecret
 * ::datatype string
 * ::required true
 *
 * Application secret.
 *
 * ::details
 *
 * The route supports both offset and cursor pagination and passes through the optional `account` filter for account-scoped role export.
 *
 * ::end
 */
/**
 * GET /bridge/api.v1/application/roles
 *
 * Returns roles defined for the given application, with permissions
 * denormalized inline on each role.
 *
 * Auth (required):
 *   appId     — application ID
 *   appSecret — application secret
 *
 * Pagination — choose one mode:
 *   Offset:  ?start=0&end=100          (default: 0–100)
 *   Cursor:  ?startFrom=<roleId>&limit=100
 *
 * Response (200):
 * {
 *   success: true,
 *   columns: string[],
 *   data: [
 *     {
 *       roleId, roleName, roleDescription, roleScope,
 *       permissions: [
 *         { rolePermissionId, permissionId, permissionName,
 *           permissionDescription, permissionTag, denormalized }
 *       ]
 *     },
 *     ...
 *   ],
 *   meta: {
 *     total: number,
 *     returned: number,
 *     startedAt: string | null,
 *     endedAt: string | null
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.has('appId')) {
    return NextResponse.json(
      { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
      { status: 400 }
    );
  }

  const result = await getApplicationRoles({
    appId:     sp.get('app'),
    appSecret: sp.get('appSecret'),
    account:   sp.get('account'),
    start:     sp.get('start'),
    end:       sp.get('end'),
    startFrom: sp.get('startFrom'),
    limit:     sp.get('limit'),
    fromDate:  sp.get('fromDate'),
    toDate:    sp.get('toDate'),
  });

  return NextResponse.json(result.body, { status: result.status });
}
