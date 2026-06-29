/**
 * services/auth/accountJwt.ts
 *
 * Issues account-scoped JWTs for external API access.
 *
 * Token shape: { cid, iat, exp }
 *   cid — Connection.id (stable link between an account and an app)
 *
 * After obtaining the token, callers use:
 *   GET /account/bridge/api.v1/accounts/lookup  — public profile lookup by accountId or neupId
 *   GET /account/bridge/api.v1/accounts         — all accessible accounts with permissions
 */

import jwt from 'jsonwebtoken';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';

/*
::neup.documentation::account-jwt-service
::title Account JWT Service

Issues app-scoped bearer tokens for account-based bridge API access.

::public

The token shape is intentionally minimal: `{ cid, iat, exp }`.

::public end

::private

The service validates the session triplet, ensures the account-to-app connection row exists, and signs the token with `Application.appSecret`.

::private end

::end
*/

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What's inside the JWT — minimal by design. */
export type AccountJwtPayload = {
  cid: string;   // Connection.id
  iat?: number;
  exp?: number;
};

export type IssueTokenResult =
  | { status: 200; body: { success: true; token: string; exp: number } }
  | { status: 400 | 401 | 404 | 500; body: { success: false; error: string; error_description?: string } };

// ---------------------------------------------------------------------------
// Token lifetime
// ---------------------------------------------------------------------------

/** JWT lives for 7 days. Re-issue by calling /auth/token again. */
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveAppSecret(appId: string): Promise<string | null> {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { appSecret: true },
  });
  return app?.appSecret ?? null;
}

async function validateSession(aid: string, sid: string, skey: string): Promise<boolean> {
  const session = await prisma.authnSession.findUnique({
    where: { id: sid },
    select: { accountId: true, key: true, validTill: true },
  });
  return (
    !!session &&
    session.accountId === aid &&
    session.key === skey &&
    !!session.validTill &&
    session.validTill > new Date()
  );
}

// ---------------------------------------------------------------------------
// Issue token
// ---------------------------------------------------------------------------

/**
 * ::neup.documentation::issue-account-token
 * ::function issueAccountToken(input)
 *
 * Issues an application bearer token from a validated session triplet.
 *
 * ::public
 *
 * The returned token can be used for app-scoped bridge APIs that accept bearer-token auth.
 *
 * ::public end
 *
 * ::private
 *
 * The function does not embed full account data. It only embeds the stable connection id and expiry timestamps.
 *
 * ::private end
 *
 * ::param external input
 * ::datatype object
 * ::required true
 *
 * Token-issuance input containing `aid`, `sid`, `skey`, and `appId`.
 *
 * ::end
 */
/**
 * Validates the session triplet (aid, sid, skey) against the database,
 * ensures a Connection exists, then issues a JWT containing
 * only { cid, iat, exp }.
 *
 * The JWT is signed with Application.appSecret (HS256).
 */
export async function issueAccountToken(input: {
  aid?: string;
  sid?: string;
  skey?: string;
  appId?: string;
}): Promise<IssueTokenResult> {
  const { aid, sid, skey, appId } = input;

  if (!aid || !sid || !skey || !appId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'aid, sid, skey, and appId are all required',
      },
    };
  }

  try {
    // 1. Validate session
    const sessionValid = await validateSession(aid, sid, skey);
    if (!sessionValid) {
      return {
        status: 401,
        body: {
          success: false,
          error: 'invalid_session',
          error_description: 'Session not found, expired, or credentials do not match',
        },
      };
    }

    // 2. Resolve app secret
    const appSecret = await resolveAppSecret(appId);
    if (!appSecret) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'app_not_found',
          error_description: 'Application not found or has no secret configured',
        },
      };
    }

    // 3. Ensure Connection exists — get its ID
    const defaultRoleId = await getApplicationDefaultRoleId(appId);
    const connection = await prisma.connection.upsert({
      where: { accountId_appId: { accountId: aid, appId } },
      update: {},
      create: { accountId: aid, appId, status: 'active', roleId: defaultRoleId },
      select: { id: true },
    });

    // 4. Sign JWT — only cid, iat, exp
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + TOKEN_TTL_SECONDS;

    const payload: AccountJwtPayload = { cid: connection.id, iat, exp };
    const token = jwt.sign(payload, appSecret, { algorithm: 'HS256' });

    return { status: 200, body: { success: true, token, exp } };
  } catch (error) {
    await logError('auth', error, `issueAccountToken:${aid}:${appId}`);
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}
