import { NextResponse, type NextRequest } from 'next/server';
import { getApplicationUsers } from '@/services/bridge/application-users';
import { validateSilentSsoOrigin } from '@/services/auth/silent-sso';

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
  if (!origin) return new NextResponse(null, { status: 403 });
  const { valid } = await validateSilentSsoOrigin(origin);
  if (!valid) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(new URL(origin).origin) });
}

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

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const origin = await resolveRequestOrigin(request);

  // Endpoint is restricted to registered origins only.
  if (!origin) {
    return NextResponse.json({ success: false, error: 'forbidden_missingOrigin' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: 'invalid_request' },
      { status: 400, headers: corsHeaders(new URL(origin).origin) }
    );
  }

  const appId = readNormalizedBodyValue(body as Record<string, unknown>, 'appid');
  const appSecret = readNormalizedBodyValue(body as Record<string, unknown>, 'appsecret');
  if (!appId || !appSecret) {
    return NextResponse.json(
      { success: false, error: 'forbidden_missingAppCredentails' },
      { status: 400, headers: corsHeaders(new URL(origin).origin) }
    );
  }

  const { valid, appId: originAppId } = await validateSilentSsoOrigin(origin);
  if (!valid || originAppId !== appId) {
    return NextResponse.json(
      { success: false, error: 'forbidden_invalidOrigin' },
      { status: 403, headers: corsHeaders(new URL(origin).origin) }
    );
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

  const headers = origin ? corsHeaders(new URL(origin).origin) : undefined;
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'method_not_allowed' }, { status: 405 });
}
