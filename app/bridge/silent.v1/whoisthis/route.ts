import { NextRequest } from 'next/server';
import { getSessionCookies } from '@/core/auth/cookies';
import { getAccounts } from '@/core/auth/accounts';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { resolveGuestAccount } from '@/core/auth/guestAccount';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import {
  checkRateLimit,
  validateSilentSsoOrigin,
  resolveOrCreateIdentity,
  buildIdentityDetails,
  ensureApplicationConnection,
  issueSilentAuthCode,
} from '@/services/auth/silent-sso';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MESSAGE_TYPE = 'neupid:silentAuth';
const BASE_APP_ID = 'neup.account';

function buildHtmlResponse(payload: object, targetOrigin: string): Response {
  const payloadJson = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="sso-payload" data-payload="${payloadJson.replace(/"/g, '&quot;')}"></div>
<script>
(function() {
  try {
    var el = document.getElementById('sso-payload');
    var payload = JSON.parse(el.getAttribute('data-payload'));
    window.parent.postMessage(payload, ${JSON.stringify(targetOrigin)});
  } catch(e) {
    window.parent.postMessage({ type: ${JSON.stringify(MESSAGE_TYPE)}, success: false, reason: 'internal_error' }, ${JSON.stringify(targetOrigin)});
  }
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': 'frame-ancestors *',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// Token lifetime: 7 days
// ---------------------------------------------------------------------------

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /bridge/silent.v1/whoisthis?app=[id]
 *
 * Single silent-auth entry point. No separate init step needed — guest
 * account initialization runs automatically here.
 *
 * Responds via postMessage with:
 * {
 *   type:     'neupid:silentAuth',
 *   success:  boolean,
 *   token:    { cid, iat, exp }
 *   response: { ...account info }       — empty object when unauthenticated/guest
 * }
 * When the token expires the caller reloads this iframe to get a fresh one.
 */
export async function GET(request: NextRequest): Promise<Response> {
  // 1. Resolve origin
  let origin = request.headers.get('origin') ?? '';
  if (!origin) {
    const referer = request.headers.get('referer') ?? '';
    if (referer) {
      try { origin = new URL(referer).origin; } catch { origin = ''; }
    }
  }

  // 2. Rate limit
  if (!checkRateLimit(origin || 'unknown')) {
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'rate_limited' },
      origin || '*'
    );
  }

  // 3. Resolve appId
  const { searchParams } = new URL(request.url);
  if (searchParams.has('appId')) {
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'invalid_request' },
      origin || '*'
    );
  }
  const queryAppId = searchParams.get('app');
  let allowDevModeForApp = false;

  // If ?app is missing, treat this as the base account system / first-party usage.
  // Only allow first-party origins (*.neupgroup.com) in this mode.
  let appId: string;
  let targetOrigin: string;

  if (!origin) {
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'origin_not_registered' },
      '*'
    );
  }

  try {
    const originUrl = new URL(origin);
    targetOrigin = originUrl.origin;
    const host = originUrl.hostname.toLowerCase();

    appId = queryAppId || BASE_APP_ID;

    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { details: true },
    });

    const appDetails =
      app?.details && typeof app.details === 'object'
        ? (app.details as Record<string, unknown>)
        : {};
    allowDevModeForApp = Boolean(appDetails.allowDevMode);

    // 1) First-party origin always passes origin checks.
    if (host === 'neupgroup.com') {
      // Skip all other origin checks.
    } else if (allowDevModeForApp) {
      // 2) Dev mode also bypasses origin checks.
    } else {
      // 3) Otherwise enforce registered origin checks.
      const { valid, appId: originAppId } = await validateSilentSsoOrigin(origin);
      if (!valid || !originAppId) {
        return buildHtmlResponse(
          { type: MESSAGE_TYPE, success: false, reason: 'origin_not_registered' },
          '*'
        );
      }

      if (queryAppId && queryAppId !== originAppId) {
        return buildHtmlResponse(
          { type: MESSAGE_TYPE, success: false, reason: 'app_mismatch' },
          targetOrigin
        );
      }
    }
  } catch {
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'origin_not_registered' },
      '*'
    );
  }

  // 4. Ensure app exists
  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true },
    });
    if (!application) {
      return buildHtmlResponse(
        { type: MESSAGE_TYPE, success: false, reason: 'app_not_found' },
        targetOrigin
      );
    }
  } catch (error) {
    await logError('auth', error, 'whoisthis_load_application');
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'internal_error' },
      targetOrigin
    );
  }

  // 6. Session check
  const { accountId, sessionId, sessionKey } = await getSessionCookies();
  let isAuthenticated = false;

  if (accountId && sessionId && sessionKey) {
    try {
      const session = await prisma.authnSession.findUnique({
        where: { id: sessionId },
        select: { accountId: true, key: true, validTill: true },
      });
      isAuthenticated =
        !!session &&
        session.accountId === accountId &&
        session.key === sessionKey &&
        !!session.validTill &&
        session.validTill > new Date();
    } catch (error) {
      await logError('auth', error, 'whoisthis_session_check');
    }
  }

  // 7. Initialize guest account if needed
  await resolveGuestAccount(isAuthenticated ? (accountId || null) : null);

  const allAccounts = await getAccounts();
  const guestEntry = allAccounts.find(a => a.def === 1 && !a.nid);
  const guestAccountId = guestEntry?.aid ?? null;

  if (!guestAccountId) {
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'internal_error' },
      targetOrigin
    );
  }

  // 8. Resolve Identity for (guestAccountId, appId)
  let identity;
  try {
    identity = await resolveOrCreateIdentity(guestAccountId, appId);
  } catch (error) {
    await logError('auth', error, 'whoisthis_resolve_identity');
    return buildHtmlResponse(
      { type: MESSAGE_TYPE, success: false, reason: 'internal_error' },
      targetOrigin
    );
  }

  // 9. Build token payload based on party
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;

  let cid: string | null = null;

  if (isAuthenticated && accountId) {
    // Ensure ApplicationConnection exists and get its stable ID
    try {
      const defaultRoleId = await getApplicationDefaultRoleId(appId);
      const connection = await prisma.connection.upsert({
        where: { accountId_appId: { accountId, appId } },
        update: {},
        create: { accountId, appId, status: 'active', roleId: defaultRoleId },
        select: { id: true },
      });
      cid = connection.id;
    } catch (error) {
      await logError('auth', error, 'whoisthis_upsert_connection');
    }
  }

  const tokenPayload: Record<string, unknown> = {
    cid: cid ?? identity.id,
    iat,
    exp,
  };

  // 10. Build response (account info) — only when authenticated
  let response: Record<string, unknown> = {};

  if (isAuthenticated && accountId) {
    try {
      const details = await buildIdentityDetails(accountId);
      // Convert details array to a flat key→value map for convenience
      for (const { key, value } of details) {
        response[key] = value;
      }
    } catch (error) {
      await logError('auth', error, 'whoisthis_build_response');
      // Non-fatal — return empty response rather than failing
    }

    // Ensure ApplicationConnection is recorded
    await ensureApplicationConnection(accountId, appId);
  }

  // 11. Return result
  return buildHtmlResponse(
    {
      type: MESSAGE_TYPE,
      success: true,
      token: tokenPayload,
      response,
    },
    targetOrigin
  );
}
