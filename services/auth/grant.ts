import prisma from '@/core/helpers/prisma';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logError } from '@/core/helpers/logger';
import { makeNotification } from '@/services/notifications';
import { getAccountPermission, isRootUser } from '@/services/user';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
  return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}

function resolveAppId(input: { app?: string }): string | null {
  const raw = (input.app || '').trim();
  return raw ? raw : null;
}

// Resolves the role name and permission set for an account in the context of an external app.
async function resolveAccountGrant(accountId: string, appId: string): Promise<{ role: string; permissions: string[] }> {
  const [account, permissions, isRoot] = await Promise.all([
    prisma.account.findUnique({ where: { id: accountId }, select: { accountType: true } }),
    getAccountPermission(accountId),
    isRootUser(accountId),
  ]);

  const role = isRoot ? 'root' : (account?.accountType ?? 'individual');
  return { role, permissions };
}

/**
 * Function bridgeIssueGrant.
 */
export async function bridgeIssueGrant(input: {
  tempToken?: string;
  app?: string;
}): Promise<{ status: number; body: Record<string, any> }> {
  const { tempToken } = input;
  if ((input as any).appId) {
    return {
      status: 400,
      body: { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
    };
  }
  const appId = resolveAppId(input);

  if (!tempToken || !appId) {
    return {
      status: 400,
      body: { success: false, error: 'invalid_request', error_description: 'Missing tempToken or app' },
    };
  }

  try {
    const now = new Date();

    // Atomically consume the token in a single query — no TOCTOU window.
    // update() throws if no row matches, which means the token was already used,
    // expired, or never existed. We catch that and return 401.
    let request: { id: string; type: string; data: unknown; accountId: string | null; expiresAt: Date };
    try {
      request = await prisma.authnRequest.update({
        where: {
          id: tempToken,
          type: 'bridge_grant',
          status: 'pending',
        },
        data: { status: 'used' },
        select: { id: true, type: true, data: true, accountId: true, expiresAt: true },
      });
    } catch {
      return {
        status: 401,
        body: { error: 'invalid_token', error_description: 'Token not found, expired, or already used' },
      };
    }

    const requestData = (request.data as Record<string, any> | null) || {};
    const requestAppId = typeof requestData.appId === 'string' ? requestData.appId : null;

    // Validate expiry and appId after consumption — if invalid, the token is still
    // marked used so it cannot be replayed.
    if (!request.accountId || request.expiresAt <= now || requestAppId !== appId) {
      return {
        status: 401,
        body: { success: false, error: 'invalid_token', error_description: 'Token not found, expired, or already used' },
      };
    }

    const { role: roleName, permissions } = await resolveAccountGrant(request.accountId, appId);

    const skey = crypto.randomBytes(32).toString('hex');

    const sessionExpSeconds = 60 * 60 * 24 * 7;
    const sessionExpiresOn = new Date();
    sessionExpiresOn.setSeconds(sessionExpiresOn.getSeconds() + sessionExpSeconds);

    const jwtExpSeconds = 60 * 7;
    const iat = Math.floor(Date.now() / 1000);
    const jwtExp = iat + jwtExpSeconds;

    const payload: any = {
      aid: request.accountId,
      role: roleName,
      iat,
      exp: jwtExp,
    };

    if (permissions.length > 0) {
      payload.per = permissions;
    }

    const application = await prisma.application.findUnique({
      where: { id: appId },
    });

    if (!application || !application.appSecret) {
      return {
        status: 500,
        body: { success: false, error: 'invalid_app', error_description: 'Application configuration error' },
      };
    }

    const defaultRoleId = await getApplicationDefaultRoleId(appId);
    await prisma.connection.upsert({
      where: {
        accountId_appId: {
          accountId: request.accountId,
          appId,
        },
      },
      update: {},
      create: {
        accountId: request.accountId,
        appId,
        roleId: defaultRoleId,
      },
    });

    const externalSession = await prisma.authnSession.create({
      data: {
        accountId: request.accountId,
        ipAddress: 'bridge',
        userAgent: 'External Application',
        lastLoggedIn: new Date(),
        loginType: externalLoginType(appId),
        validTill: sessionExpiresOn,
        key: skey,
      },
    });

    payload.sid = externalSession.id;
    payload.appId = appId;
    const signed = jwt.sign(payload, application.appSecret);

    await makeNotification({
      recipient_id: request.accountId,
      action: 'informative.application_authorized',
      message: `Application ${application.name} was authorized.`,
    });

    return {
      status: 200,
      body: {
        success: true,
        aid: request.accountId,
        sid: externalSession.id,
        skey,
        // Docs prefer `token`; keep `jwt` for backward compatibility.
        token: signed,
        jwt: signed,
        exp: jwtExp,
        role: roleName,
        ...(permissions.length > 0 ? { per: permissions } : {}),
      },
    };
  } catch (error) {
    await logError('auth', error, 'bridge_issue_grant');
    return {
      status: 500,
      body: { success: false, error: 'internal_server_error', error_description: 'An unexpected error occurred' },
    };
  }
}


/**
 * Function bridgeRefreshGrant.
 */
export async function bridgeRefreshGrant(input: {
  token?: string;
  sid?: string;
  aid?: string;
  skey?: string;
  app?: string;
}): Promise<{ status: number; body: Record<string, any> }> {
  if ((input as any).appId) {
    return {
      status: 400,
      body: { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
    };
  }
  const appId = resolveAppId(input);

  try {
    // Token-based refresh (docs/authentication.md): { token } (+ optional ?app=)
    if (input.token) {
      // Accept token-only by decoding appId without verification first.
      let resolvedAppId = appId;
      if (!resolvedAppId) {
        const decodedUnverified = jwt.decode(input.token) as any;
        const tokenAppId = typeof decodedUnverified?.appId === 'string' ? decodedUnverified.appId : null;
        resolvedAppId = tokenAppId || null;
      }

      if (!resolvedAppId) {
        return {
          status: 400,
          body: { success: false, error: 'invalid_request', error_description: 'Missing app' },
        };
      }

      const application = await prisma.application.findUnique({ where: { id: resolvedAppId }, select: { appSecret: true } });
      if (!application?.appSecret) {
        return {
          status: 404,
          body: { success: false, error: 'app_not_found', error_description: 'Application not found or has no secret configured' },
        };
      }

      let payload: any;
      try {
        payload = jwt.verify(input.token, application.appSecret);
      } catch {
        return {
          status: 401,
          body: { success: false, error: 'invalid_grant', error_description: 'Grant not found, expired, or tampered' },
        };
      }

      const aid = typeof payload?.aid === 'string' ? payload.aid : null;
      const sid = typeof payload?.sid === 'string' ? payload.sid : null;
      const tokenAppId = typeof payload?.appId === 'string' ? payload.appId : null;

      if (!aid || !sid || (tokenAppId && tokenAppId !== resolvedAppId)) {
        return {
          status: 401,
          body: { success: false, error: 'invalid_grant', error_description: 'Grant not found, expired, or tampered' },
        };
      }

      const appSession = await prisma.authnSession.findFirst({
        where: {
          id: sid,
          accountId: aid,
          loginType: externalLoginType(resolvedAppId),
          validTill: { gt: new Date() },
        },
        select: { id: true, accountId: true, validTill: true, lastLoggedIn: true },
      });

      if (!appSession) {
        return {
          status: 401,
          body: { success: false, error: 'invalid_session', error_description: 'Session not found or expired' },
        };
      }

      const { role: roleName, permissions } = await resolveAccountGrant(aid, resolvedAppId);

      const sessionExpSeconds = 60 * 60 * 24 * 7;
      const newSessionExpiresOn = new Date();
      newSessionExpiresOn.setSeconds(newSessionExpiresOn.getSeconds() + sessionExpSeconds);

      const jwtExpSeconds = 60 * 7;
      const iat = Math.floor(Date.now() / 1000);
      const jwtExp = iat + jwtExpSeconds;

      const newPayload: any = {
        aid,
        sid,
        appId: resolvedAppId,
        role: roleName,
        iat,
        exp: jwtExp,
      };

      if (permissions.length > 0) {
        newPayload.per = permissions;
      }

      const newToken = jwt.sign(newPayload, application.appSecret);

      await prisma.authnSession.update({
        where: { id: sid },
        data: {
          validTill: newSessionExpiresOn,
          lastLoggedIn: new Date(),
        },
      });

      return {
        status: 200,
        body: {
          success: true,
          aid,
          sid,
          token: newToken,
          jwt: newToken,
          exp: jwtExp,
          role: roleName,
          ...(permissions.length > 0 ? { per: permissions } : {}),
        },
      };
    }

    // Legacy refresh: { aid, sid, skey, appId }
    const { sid, aid, skey } = input;
    if (!sid || !aid || !skey || !appId) {
      return {
        status: 400,
        body: { success: false, error: 'invalid_request', error_description: 'Missing sid, aid, skey, or app' },
      };
    }

    const appSession = await prisma.authnSession.findFirst({
      where: {
        id: sid,
        accountId: aid,
        key: skey,
        loginType: externalLoginType(appId),
        validTill: { gt: new Date() },
      },
      select: { id: true, accountId: true, validTill: true, lastLoggedIn: true },
    });

    if (!appSession) {
      return {
        status: 401,
        body: { success: false, error: 'invalid_session', error_description: 'Session not found or expired' },
      };
    }

    const { role: roleName, permissions } = await resolveAccountGrant(aid, appId);

    const sessionExpSeconds = 60 * 60 * 24 * 7;
    const newSessionExpiresOn = new Date();
    newSessionExpiresOn.setSeconds(newSessionExpiresOn.getSeconds() + sessionExpSeconds);

    const jwtExpSeconds = 60 * 7;
    const iat = Math.floor(Date.now() / 1000);
    const jwtExp = iat + jwtExpSeconds;

    const payload: any = {
      aid,
      sid,
      appId,
      role: roleName,
      iat,
      exp: jwtExp,
    };

    if (permissions.length > 0) {
      payload.per = permissions;
    }

    const application = await prisma.application.findUnique({ where: { id: appId } });
    if (!application?.appSecret) {
      return {
        status: 500,
        body: { success: false, error: 'invalid_app', error_description: 'Application configuration error' },
      };
    }

    const newToken = jwt.sign(payload, application.appSecret);

    await prisma.authnSession.update({
      where: { id: sid },
      data: {
        validTill: newSessionExpiresOn,
        lastLoggedIn: new Date(),
      },
    });

    return {
      status: 200,
      body: {
        success: true,
        aid,
        sid,
        token: newToken,
        jwt: newToken,
        exp: jwtExp,
        role: roleName,
        ...(permissions.length > 0 ? { per: permissions } : {}),
      },
    };
  } catch (error) {
    await logError('auth', error, 'bridge_refresh_grant');
    return {
      status: 500,
      body: { success: false, error: 'internal_server_error', error_description: 'An unexpected error occurred' },
    };
  }
}


/**
 * Function bridgeCheckGrant.
 */
export async function bridgeCheckGrant(input: {
  aid?: string;
  sid?: string;
  skey?: string;
  app?: string;
}): Promise<{ status: number; body: Record<string, any> }> {
  if ((input as any).appId) {
    return {
      status: 400,
      body: { success: false, error: 'invalid_request', error_description: 'Use `app` (not `appId`).' },
    };
  }
  const { aid, sid, skey } = input;
  const appId = resolveAppId(input);

  if (!aid || !sid || !skey || !appId) {
    return {
      status: 400,
      body: { success: false, error: 'invalid_request', error_description: 'Missing aid, sid, skey, or app' },
    };
  }

  try {
    const appSession = await prisma.authnSession.findFirst({
      where: {
        id: sid,
        accountId: aid,
        key: skey,
        loginType: externalLoginType(appId),
        validTill: { gt: new Date() },
      },
      select: { accountId: true, validTill: true, lastLoggedIn: true },
    });

    if (!appSession) {
      return {
        status: 401,
        body: { success: false, error: 'invalid_grant', error_description: 'Grant not found or expired' },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        aid: appSession.accountId,
        appId,
        validTill: appSession.validTill,
        lastLoggedIn: appSession.lastLoggedIn,
      },
    };
  } catch (error) {
    await logError('auth', error, 'bridge_check_grant');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}
