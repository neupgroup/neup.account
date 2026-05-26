import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/core/helpers/prisma';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { verifyAccountToken } from '@/core/auth/accountToken';
import { resolveWhoAmI } from '@/services/auth/whoami';
import { resolveGuestAccount } from '@/services/auth/guestAccount';
import { getSessionCookies } from '@/core/helpers/cookies';

export const dynamic = 'force-dynamic';

const DEFAULT_APP_ID = 'neup.account';
const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
  return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

async function getCookieToken(): Promise<string | null> {
  const store = await cookies();
  const t = store.get('auth_account')?.value?.trim();
  return t || null;
}

function hostnameFromHttpsOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function isOriginAllowedForApp(origin: string, appId: string): Promise<boolean> {
  const incomingHost = hostnameFromHttpsOrigin(origin);
  if (!incomingHost) return false;

  const records = await prisma.applicationBridge.findMany({
    where: { appId, type: 'authenticatesTo' },
    select: { value: true },
  });

  for (const r of records) {
    try {
      const registered = new URL(r.value);
      const registeredHost = registered.hostname.toLowerCase();
      if (registeredHost === incomingHost) return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function isOriginAllowedForAnyApp(origin: string): Promise<boolean> {
  const incomingHost = hostnameFromHttpsOrigin(origin);
  if (!incomingHost) return false;

  const records = await prisma.applicationBridge.findMany({
    where: { type: 'authenticatesTo' },
    select: { value: true },
  });

  for (const r of records) {
    try {
      const registered = new URL(r.value);
      const registeredHost = registered.hostname.toLowerCase();
      if (registeredHost === incomingHost) return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function resolveAppIdFromToken(token: string | null): Promise<string> {
  if (!token) return DEFAULT_APP_ID;

  // 1) If it's an internal auth_account token (RS256 or dev unsigned), it has no appId.
  const accountPayload = await verifyAccountToken(token);
  if (accountPayload) return DEFAULT_APP_ID;

  // 2) External-app grant token (HS256) may include appId.
  const decoded = jwt.decode(token) as any;
  const appId = typeof decoded?.appId === 'string' ? decoded.appId.trim() : '';
  return appId || DEFAULT_APP_ID;
}

async function ensureConnectionForApp(accountId: string, appId: string): Promise<{
  ok: boolean;
  status: number;
  body: { error: string; error_description?: string };
}> {
  const connection = await prisma.connection.upsert({
    where: { accountId_appId: { accountId, appId } },
    update: {},
    create: { accountId, appId, status: 'active' },
    select: { status: true },
  });

  if (connection.status === 'active') {
    return { ok: true, status: 200, body: { error: '' } };
  }

  if (connection.status === 'invited') {
    return {
      ok: false,
      status: 403,
      body: { error: 'connection_invited', error_description: 'Account is invited but not approved yet' },
    };
  }

  return {
    ok: false,
    status: 403,
    body: {
      error: `connection_${connection.status}`,
      error_description: `Connection status is ${connection.status}`,
    },
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return new NextResponse(null, { status: 204 });

  // Preflight requests do not include cookies or Authorization headers reliably,
  // so we can only validate that the origin is registered for at least one app.
  const allowed = await isOriginAllowedForAnyApp(origin);
  if (!allowed) return new NextResponse(null, { status: 403 });

  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * GET /bridge/api.v1/auth/whoisthis
 *
 * Returns the identity of the currently logged-in user.
 *
 * Auth:
 * - If an `Authorization: Bearer <token>` is provided and it is an external-app grant token,
 *   we validate the external app session (sid + aid) and return the account identity.
 * - Otherwise, we fall back to the Neup.Account auth cookie (auth_account), validate the
 *   cookie session triplet (aid + sid + skey), and return the account identity.
 *
 * Origin validation:
 * - If an Origin header is present, it must be registered as an authenticatesTo URL for the
 *   resolved appId (from token.appId when present, otherwise DEFAULT_APP_ID).
 * - Scheme must be https, and matching is hostname-only (port + path ignored).
 */
async function handleWhoIsThis(request: NextRequest) {
  if (request.headers.get('auth_account') !== null) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'auth_account must be passed as a cookie only' },
      { status: 400 }
    );
  }

  const origin = request.headers.get('origin');

  const bearerToken = getBearerToken(request);
  const cookieToken = await getCookieToken();
  const tokenForAppScope = bearerToken || cookieToken;
  const appId = await resolveAppIdFromToken(tokenForAppScope);

  if (origin) {
    const allowed = await isOriginAllowedForApp(origin, appId);
    if (!allowed) {
      return NextResponse.json(
        { error: 'forbidden', error_description: 'Origin not registered for this app' },
        { status: 403 }
      );
    }
  }

  // 1) If caller provided bearer token, treat it as external-app grant token.
  if (bearerToken) {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { appSecret: true },
    });

    if (!application?.appSecret) {
      return NextResponse.json(
        { error: 'app_not_found', error_description: 'Application not found or has no secret configured' },
        { status: 404, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    let decoded: any;
    try {
      decoded = jwt.verify(bearerToken, application.appSecret);
    } catch {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Invalid or expired token' },
        { status: 401, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    const aid = typeof decoded?.aid === 'string' ? decoded.aid : null;
    const sid = typeof decoded?.sid === 'string' ? decoded.sid : null;
    const tokenAppId = typeof decoded?.appId === 'string' ? decoded.appId : null;

    if (!aid || !sid || (tokenAppId && tokenAppId !== appId)) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Invalid token payload' },
        { status: 401, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    const session = await prisma.authnSession.findFirst({
      where: {
        id: sid,
        accountId: aid,
        loginType: externalLoginType(appId),
        validTill: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Invalid or expired session' },
        { status: 401, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    // Fetch identity based on account only (session already validated above).
    const result = await prisma.account.findUnique({
      where: { id: aid },
      select: {
        id: true,
        status: true,
        displayName: true,
        displayImage: true,
        isVerified: true,
        accountType: true,
        details: true,
        neupIds: { where: { isPrimary: true }, take: 1, select: { id: true } },
        individualProfile: { select: { firstName: true, lastName: true } },
        brandProfile: { select: { brandName: true } },
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Account not found' },
        { status: 401, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    const details = result.details as Record<string, any> | null;
    const block = details?.block as { is_permanent?: boolean; until?: string | Date } | null;
    if (result.status === 'blocked' && block) {
      const isPermanent = block.is_permanent;
      const isTemporary = block.until && new Date(block.until) > new Date();
      if (isPermanent || isTemporary) {
        return NextResponse.json(
          { error: 'account_blocked', error_description: 'This account is currently blocked' },
          { status: 403, headers: origin ? corsHeaders(origin) : undefined }
        );
      }
    }

    const neupId = result.neupIds[0]?.id ?? null;
    const displayName =
      result.brandProfile?.brandName ||
      result.displayName ||
      [result.individualProfile?.firstName, result.individualProfile?.lastName]
        .filter(Boolean)
        .join(' ') ||
      null;

    const connection = await ensureConnectionForApp(result.id, appId);
    if (!connection.ok) {
      return NextResponse.json(connection.body, {
        status: connection.status,
        headers: origin ? corsHeaders(origin) : undefined,
      });
    }

    return NextResponse.json(
      {
        success: true,
        accountId: result.id,
        neupId,
        displayName,
        displayImage: result.displayImage || null,
        accountType: result.accountType || null,
        verified: result.isVerified ?? false,
      },
      { status: 200, headers: origin ? corsHeaders(origin) : undefined }
    );
  }

  // 2) Cookie session fallback (first-party).
  if (!cookieToken) {
    // 4) No cookie and no token: create/resolve guest account and use it.
    await resolveGuestAccount(null);
    const guest = await getSessionCookies();

    if (!guest.accountId || !guest.sessionId || !guest.sessionKey) {
      return NextResponse.json(
        { error: 'internal_server_error', error_description: 'Could not initialize guest account' },
        { status: 500, headers: origin ? corsHeaders(origin) : undefined }
      );
    }

    const connection = await ensureConnectionForApp(guest.accountId, appId);
    if (!connection.ok) {
      return NextResponse.json(connection.body, {
        status: connection.status,
        headers: origin ? corsHeaders(origin) : undefined,
      });
    }

    const who = await resolveWhoAmI({
      accountId: guest.accountId,
      sessionId: guest.sessionId,
      sessionKey: guest.sessionKey,
    });

    return NextResponse.json(who.body, {
      status: who.status,
      headers: origin ? corsHeaders(origin) : undefined,
    });
  }

  const payload = await verifyAccountToken(cookieToken);
  if (!payload?.aid || !payload?.sid || !payload?.skey) {
    return NextResponse.json(
      { error: 'unauthenticated', error_description: 'No active session' },
      { status: 401, headers: origin ? corsHeaders(origin) : undefined }
    );
  }

  const who = await resolveWhoAmI({ accountId: payload.aid, sessionId: payload.sid, sessionKey: payload.skey });
  if (who.status === 200) {
    const connection = await ensureConnectionForApp(payload.aid, appId);
    if (!connection.ok) {
      return NextResponse.json(connection.body, {
        status: connection.status,
        headers: origin ? corsHeaders(origin) : undefined,
      });
    }
  }

  return NextResponse.json(who.body, {
    status: who.status,
    headers: origin ? corsHeaders(origin) : undefined,
  });
}

export async function GET(request: NextRequest) {
  return handleWhoIsThis(request);
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'method_not_allowed', error_description: 'Use GET for this endpoint' },
    { status: 405 }
  );
}
