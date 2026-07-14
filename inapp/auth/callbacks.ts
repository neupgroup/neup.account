/**
 * ::neup.documentation::inapp-auth-callbacks
 * ::title In-App Auth Callbacks
 *
 * URL helpers for carrying auth callback context and flow parameters through browser navigation.
 *
 * ::public
 *
 * This module parses auth callback query params such as `appId`, `authenticatesTo`, `purpose`, `backsTo`, and `steps`, and appends them to in-app auth routes when needed.
 *
 * ::public end
 *
 * ::private
 *
 * The helpers are specific to the account app's external-auth handshake and multi-step auth pages, so they must not live in `core`.
 *
 * ::private end
 *
 * ::end
 */

type SearchParamsLike = {
  get: (key: string) => string | null;
};

export type AuthCallbackContext = {
  appId: string | null;
  appIdKey: 'appId' | 'appid';
  authenticatesTo: string | null;
  purpose: 'externalAuthentication' | null;
};

export function getAuthCallbackContext(searchParams: SearchParamsLike): AuthCallbackContext {
  const appId = searchParams.get('appId') || searchParams.get('appid');
  const appIdKey = searchParams.get('appid') ? 'appid' : 'appId';
  const authenticatesTo = searchParams.get('authenticatesTo') || searchParams.get('authenticatesto');
  const purpose = searchParams.get('purpose') === 'externalAuthentication' ? 'externalAuthentication' : null;

  return {
    appId,
    appIdKey,
    authenticatesTo,
    purpose,
  };
}

export function hasAuthCallbackContext(searchParams: SearchParamsLike): boolean {
  const { appId, authenticatesTo } = getAuthCallbackContext(searchParams);
  return Boolean(appId && authenticatesTo);
}

export function shouldReturnToAuthStartForExternalAuthentication(searchParams: SearchParamsLike): boolean {
  const { appId, authenticatesTo, purpose } = getAuthCallbackContext(searchParams);
  return Boolean(appId && authenticatesTo && purpose === 'externalAuthentication');
}

export function appendAuthCallbackContext(path: string, searchParams: SearchParamsLike): string {
  const { appId, appIdKey, authenticatesTo, purpose } = getAuthCallbackContext(searchParams);

  if (!appId || !authenticatesTo) {
    return path;
  }

  const params = new URLSearchParams();
  params.set(appIdKey, appId);
  params.set('authenticatesTo', authenticatesTo);

  if (purpose) {
    params.set('purpose', purpose);
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${params.toString()}`;
}

export function appendRedirect(path: string, redirects: string | null): string {
  if (!redirects) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}redirects=${encodeURIComponent(redirects)}`;
}

export function getAppDisplayName(appName: string | null | undefined): string {
  if (!appName) {
    return 'this app';
  }

  return appName;
}

export function buildCallbackUrl(
  authenticatesTo: string,
  context: Pick<AuthCallbackContext, 'appId' | 'appIdKey' | 'authenticatesTo'>,
  status?: 'allowed' | 'denied' | 'cancelled'
): string {
  const target = new URL(authenticatesTo, 'http://localhost');

  if (context.appId) {
    target.searchParams.set(context.appIdKey, context.appId);
  }

  if (context.authenticatesTo) {
    target.searchParams.set('authenticatesTo', context.authenticatesTo);
  }

  if (status) {
    target.searchParams.set('authStatus', status);
  }

  if (/^https?:\/\//i.test(authenticatesTo)) {
    return target.toString();
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type ServerAuthContext = {
  appId: string | null;
  appIdKey: 'appId' | 'appid';
  authenticatesTo: string | null;
  purpose: 'externalAuthentication' | null;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined;
  return value;
}

export function getServerAuthContext(searchParams: SearchParamsRecord): ServerAuthContext {
  const appId = pickFirst(searchParams.appId) || pickFirst(searchParams.appid) || null;
  const appIdKey: 'appId' | 'appid' = pickFirst(searchParams.appid) ? 'appid' : 'appId';
  const authenticatesTo = pickFirst(searchParams.authenticatesTo) || pickFirst(searchParams.authenticatesto) || null;
  const purpose = pickFirst(searchParams.purpose) === 'externalAuthentication' ? 'externalAuthentication' : null;
  return { appId, appIdKey, authenticatesTo, purpose };
}

export function buildAuthQuery(context: ServerAuthContext): string {
  const params = new URLSearchParams();
  if (context.appId) params.set(context.appIdKey, context.appId);
  if (context.authenticatesTo) params.set('authenticatesTo', context.authenticatesTo);
  if (context.purpose) params.set('purpose', context.purpose);
  return params.toString();
}

export function buildAuthPath(pathname: string, context: ServerAuthContext): string {
  const query = buildAuthQuery(context);
  return query ? `${pathname}?${query}` : pathname;
}

export function buildAuthCallbackWithStatus(context: ServerAuthContext, status: 'allowed' | 'denied' | 'cancelled'): string {
  if (!context.authenticatesTo) return '/auth/start';
  return buildCallbackUrl(context.authenticatesTo, context, status);
}

export type FlowParams = {
  backsTo: string | null;
  steps: string | null;
};

export function getFlowParams(searchParams: SearchParamsLike): FlowParams {
  return {
    backsTo: searchParams.get('backsTo'),
    steps: searchParams.get('steps'),
  };
}

export function getServerFlowParams(searchParams: SearchParamsRecord): FlowParams {
  return {
    backsTo: pickFirst(searchParams.backsTo) || null,
    steps: pickFirst(searchParams.steps) || null,
  };
}

export function hasFlowParams(searchParams: SearchParamsLike): boolean {
  const { backsTo, steps } = getFlowParams(searchParams);
  return Boolean(backsTo || steps);
}

export function appendFlowParams(path: string, searchParams: SearchParamsLike | null | undefined): string {
  if (!searchParams) return path;

  const { backsTo, steps } = getFlowParams(searchParams);

  if (!backsTo && !steps) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  const params = new URLSearchParams();

  if (backsTo) params.set('backsTo', backsTo);
  if (steps) params.set('steps', steps);

  return `${path}${separator}${params.toString()}`;
}

export function appendFlowParamsObject(path: string, flowParams: FlowParams): string {
  if (!flowParams.backsTo && !flowParams.steps) {
    return path;
  }

  const [basePath, existingQuery] = path.split('?');
  const existing = new URLSearchParams(existingQuery || '');

  if (flowParams.backsTo && !existing.has('backsTo')) {
    existing.set('backsTo', flowParams.backsTo);
  }
  if (flowParams.steps && !existing.has('steps')) {
    existing.set('steps', flowParams.steps);
  }

  const query = existing.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function appendAuthContextAndFlowParams(
  path: string,
  searchParams: SearchParamsLike
): string {
  let result = appendAuthCallbackContext(path, searchParams);
  result = appendFlowParams(result, searchParams);
  return result;
}
