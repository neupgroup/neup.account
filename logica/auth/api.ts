/*
::neup.documentation::logica-auth-api-module
::title Logica Auth API Helpers

Portable wrappers for public bridge authentication endpoints.

::public

Use this module to call the public auth, handshake, and silent SSO bridge routes from another app through a single shared runner.

::public end

::private

App-scoped helpers default to `NEUP_APP_ID` and `NEUP_APP_SECRET` so callers do not need to duplicate bridge credentials at every call site.

::private end

::end
*/

import {
  createNeupBridgeUrl,
  getNeupBridgeEnvironment,
  runNeupBridgeApi,
  type NeupBridgeQuery,
  type NeupBridgeResponse,
} from '@/logica/core/api-runner';

export type BridgeSessionTriplet = {
  aid: string;
  sid: string;
  skey: string;
};

type AppQueryOptions = {
  app?: string;
};

function resolveAppId(app?: string): string {
  return app?.trim() || getNeupBridgeEnvironment().appId;
}

function resolveAppCredentials(input?: { app?: string; appSecret?: string }) {
  const env = getNeupBridgeEnvironment();
  return {
    app: input?.app?.trim() || env.appId,
    appSecret: input?.appSecret?.trim() || env.appSecret,
  };
}

/**
 * ::neup.documentation::logica-auth-build-handshake-url
 * ::function buildAuthGrantHandshakeUrl(query)
 *
 * Builds the browser redirect URL for the auth grant handshake route.
 *
 * ::public
 *
 * This helper returns the URL only. Browser navigation is left to the caller.
 *
 * ::public end
 *
 * ::end
 */
export function buildAuthGrantHandshakeUrl(query: NeupBridgeQuery = {}): string {
  return createNeupBridgeUrl('/bridge/handshake.v1/auth/grant', query);
}

export async function exchangeAuthGrant(body: Record<string, unknown>): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/grant',
    method: 'POST',
    body: {
      ...body,
      app: resolveAppId(typeof body.app === 'string' ? body.app : undefined),
    },
  });
}

export async function refreshAuthGrant(body: Record<string, unknown>): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/grant',
    method: 'PATCH',
    body: {
      ...body,
      app: resolveAppId(typeof body.app === 'string' ? body.app : undefined),
    },
  });
}

export async function getAuthGrantStatus(
  input: BridgeSessionTriplet & AppQueryOptions,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/grant',
    method: 'GET',
    query: {
      aid: input.aid,
      sid: input.sid,
      skey: input.skey,
      app: resolveAppId(input.app),
    },
  });
}

export async function validateAndRefreshBridgeSession(
  body: Record<string, unknown>,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/session',
    method: 'POST',
    body,
  });
}

export async function invalidateBridgeSession(
  body: Record<string, unknown>,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/session',
    method: 'DELETE',
    body,
  });
}

export async function issueBridgeAuthToken(
  input: BridgeSessionTriplet & AppQueryOptions,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/token',
    method: 'POST',
    body: {
      aid: input.aid,
      sid: input.sid,
      skey: input.skey,
      app: resolveAppId(input.app),
    },
  });
}

export async function validateBridgeAuthToken(input: {
  token: string;
  app?: string;
}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/validate',
    method: 'POST',
    query: input.app ? { app: resolveAppId(input.app) } : undefined,
    body: { token: input.token },
  });
}

export async function expireBridgeAuthToken(input: {
  token: string;
  app?: string;
}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/expire',
    method: 'POST',
    query: input.app ? { app: resolveAppId(input.app) } : undefined,
    body: { token: input.token },
  });
}

export async function getBridgeAuthAccess(
  input: Partial<BridgeSessionTriplet> & AppQueryOptions,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/access',
    method: 'GET',
    query: {
      aid: input.aid,
      sid: input.sid,
      skey: input.skey,
      app: resolveAppId(input.app),
    },
  });
}

export async function createBridgeAuthAccess(body: Record<string, unknown>): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/access',
    method: 'POST',
    body,
  });
}

export async function updateBridgeAuthAccess(body: Record<string, unknown>): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/access',
    method: 'PATCH',
    body,
  });
}

export async function signIntoBridgeApplication(
  body: Record<string, unknown>,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/sign',
    method: 'POST',
    body: {
      ...body,
      appId:
        typeof body.appId === 'string' && body.appId.trim()
          ? body.appId.trim()
          : getNeupBridgeEnvironment().appId,
    },
  });
}

export async function verifyBridgeSession(body: {
  accountId: string;
  sessionId: string;
  sessionKey: string;
}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/verify',
    method: 'POST',
    body,
  });
}

export async function refreshActiveBridgeSession(
  authAccountToken: string,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/refresh',
    method: 'POST',
    authAccountToken,
  });
}

export async function signoutExternalBridgeSession(
  body: Record<string, unknown>,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/signout',
    method: 'POST',
    body,
  });
}

export async function getBridgeWhoAmI(input: {
  appId?: string;
  authAccountToken?: string | null;
  bearerToken?: string | null;
  origin?: string;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/whoami',
    method: 'GET',
    query: input.appId ? { app_id: input.appId } : undefined,
    authAccountToken: input.authAccountToken,
    bearerToken: input.bearerToken,
    headers: input.origin ? { origin: input.origin } : undefined,
  });
}

export async function getBridgeWhoIsThis(input: {
  appId?: string;
  authAccountToken?: string | null;
  bearerToken?: string | null;
  origin?: string;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/auth/whoisthis',
    method: 'GET',
    query: input.appId ? { app_id: input.appId } : undefined,
    authAccountToken: input.authAccountToken,
    bearerToken: input.bearerToken,
    headers: input.origin ? { origin: input.origin } : undefined,
  });
}

export async function getSilentBridgeWhoIsThis(input: {
  app?: string;
  origin?: string;
  referer?: string;
} = {}): Promise<NeupBridgeResponse<string>> {
  const headers: Record<string, string> = {};
  if (input.origin) headers.origin = input.origin;
  if (input.referer) headers.referer = input.referer;

  return runNeupBridgeApi<string>({
    path: '/bridge/silent.v1/whoisthis',
    method: 'GET',
    query: input.app ? { app: resolveAppId(input.app) } : undefined,
    headers,
  });
}

export async function exchangeSilentBridgeAuthCode(input: {
  code: string;
  codeVerifier?: string;
  app?: string;
  appSecret?: string;
}): Promise<NeupBridgeResponse> {
  const credentials = resolveAppCredentials(input);
  return runNeupBridgeApi({
    path: '/bridge/silent.v1/auth/exchange',
    method: 'POST',
    body: {
      app: credentials.app,
      appSecret: credentials.appSecret,
      code: input.code,
      codeVerifier: input.codeVerifier,
    },
  });
}

export async function getBridgeSdkScript(): Promise<NeupBridgeResponse<string>> {
  return runNeupBridgeApi<string>({
    path: '/bridge/resource.v1/sdk',
    method: 'GET',
  });
}
