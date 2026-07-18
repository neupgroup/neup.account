import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/logica/permission';
import { getApplicationUsers } from '@/services/bridge/application-users';
import { validateSilentSsoOrigin } from '@/services/auth/silent-sso';
import prisma from '@/core/database/prisma';
import { writeApplicationDevLog } from '@/services/bridge/dev-logs';

const routePermissions = [
  permission('application.account.view', 'for_individual'),
];

export const dynamic = 'force-dynamic';

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

async function resolveRequestOrigin(request: NextRequest): Promise<string | null> {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const referer = request.headers.get('referer');
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = await resolveRequestOrigin(request);
  const headers = origin ? corsHeaders(new URL(origin).origin) : undefined;
  return new NextResponse(null, { status: 204, headers });
}

/**
 * ::neup.documentation::application-users-endpoint
 * ::api POST /bridge/api.v1/application/users
 *
 * Returns accounts connected to an application.
 *
 * ::public
 *
 * Use this endpoint from an application backend when you need a paginated export of connected users.
 *
 * ::public end
 *
 * ::private
 *
 * The HTTP contract lives here. Row shaping, pagination semantics, and filters are implemented in `services/bridge/application-users.ts`.
 *
 * ::private end
 *
 * ::param external app
 * ::datatype string
 * ::required true
 *
 * Application identifier. The route accepts body key variants that normalize to `app`.
 *
 * ::param external appSecret
 * ::datatype string
 * ::required true
 *
 * Application secret. The route accepts body key variants that normalize to `appSecret`.
 *
 * ::param external offset
 * ::datatype integer
 * ::required false
 *
 * Offset pagination start.
 *
 * ::param external startFrom
 * ::datatype string
 * ::required false
 *
 * Cursor pagination start token.
 *
 * ::details
 *
 * This route allows origin-based or server-IP-based caller validation depending on application bridge configuration, then delegates to `getApplicationUsers()`.
 *
 * ::end
 */
/**
 * POST /bridge/api.v1/application/users
 *
 * Returns accounts (users) that have connected to the given application,
 * with their profile data.
 *
 * Auth (required):
 *   body.appId / appid / app-id / app_id
 *   body.appSecret / appsecret / app-secret / app_secret
 *
 * Pagination (query):
 *   ?offset=0&limit=100
 *   (start/end/startFrom are still supported for backwards compatibility)
 *
 * Date filter (optional, filters on connectedAt):
 *   ?fromDate=2025-01-01&toDate=2026-01-01
 *
 * Response (200):
 * {
 *   success: true,
 *   columns: string[],
 *   data: [
 *     {
 *       connectionId, accountId, neupId, displayName, displayImage,
 *       accountType, isVerified, accountCreatedAt, connectedAt, connectionStatus
 *     },
 *     ...
 *   ],
 *   meta: {
 *     total: number,       — total matching rows in DB
 *     returned: number,    — rows in this response
 *     startedAt: string,   — id of first row (use as next startFrom)
 *     endedAt: string      — id of last row (use as next startFrom)
 *   }
 * }
 */
function normalizeKey(input: string): string {
  return input.replace(/[_-]/g, '').toLowerCase();
}

function readNormalizedBodyValue(body: Record<string, unknown>, canonical: string): string | null {
  const target = normalizeKey(canonical);
  for (const [k, v] of Object.entries(body)) {
    if (normalizeKey(k) !== target) continue;
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const origin = await resolveRequestOrigin(request);
  const headers = origin ? corsHeaders(new URL(origin).origin) : undefined;
  let appIdForLog: string | null = null;
  let requestBodyForLog: Record<string, unknown> | null = null;

  const respond = async (payload: Record<string, unknown>, status: number) => {
    await writeApplicationDevLog({
      appId: appIdForLog,
      endpoint: '/bridge/api.v1/application/users',
      method: 'POST',
      requestHeaders: {
        'content-type': request.headers.get('content-type'),
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
        'x-real-ip': request.headers.get('x-real-ip'),
        origin: request.headers.get('origin'),
        referer: request.headers.get('referer'),
        'user-agent': request.headers.get('user-agent'),
      },
      requestPath: request.nextUrl.pathname,
      requestQuery: Object.fromEntries(request.nextUrl.searchParams.entries()),
      statusCode: status,
      requestBody: requestBodyForLog ?? undefined,
      responseBody: payload,
      error: typeof payload.error === 'string' ? payload.error : undefined,
    });
    return NextResponse.json(payload, { status, headers });
  };

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respond(
      { success: false, error: 'invalid_request' },
      400
    );
  }
  requestBodyForLog = body as Record<string, unknown>;

  const appId = readNormalizedBodyValue(body as Record<string, unknown>, 'appid');
  appIdForLog = appId;
  const appSecret = readNormalizedBodyValue(body as Record<string, unknown>, 'appsecret');
  if (!appId || !appSecret) {
    return respond(
      { success: false, error: 'forbidden_missingAppCredentails' },
      400
    );
  }

  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { details: true },
  });
  const appDetails =
    app?.details && typeof app.details === 'object'
      ? (app.details as Record<string, unknown>)
      : {};
  const allowDevModeForApp = Boolean(appDetails.allowDevMode);
  const allowDevIpModeForApp = Boolean(appDetails.allowDevIpMode);

  if (!allowDevModeForApp) {
    if (origin) {
      const { valid, appId: originAppId } = await validateSilentSsoOrigin(origin);
      if (!valid || originAppId !== appId) {
        return respond({ success: false, error: 'forbidden_invalidOrigin' }, 403);
      }
    } else if (!allowDevIpModeForApp) {
      const clientIp = getClientIp(request);
      if (!clientIp) {
        return respond({ success: false, error: 'forbidden_invalidServerIp' }, 403);
      }

      const serverIp = await prisma.applicationBridge.findFirst({
        where: { appId, type: 'serverIp', value: clientIp.toLowerCase() },
        select: { id: true },
      });
      if (!serverIp) {
        return respond({ success: false, error: 'forbidden_invalidServerIp' }, 403);
      }
    }
  }

  const result = await getApplicationUsers({
    appId,
    appSecret,
    offset:    sp.get('offset'),
    start:     sp.get('start'),
    end:       sp.get('end'),
    startFrom: sp.get('startFrom'),
    limit:     sp.get('limit'),
    fromDate:  sp.get('fromDate'),
    toDate:    sp.get('toDate'),
  });

  return respond(result.body as Record<string, unknown>, result.status);
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'method_not_allowed' }, { status: 405 });
}
