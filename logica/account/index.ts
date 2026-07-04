/*
::neup.documentation::logica-account-module
::title Logica Account Bridge Helpers

Fetch-based account helpers for reading bridge-backed account identity fields.

::public

Use this module to resolve the connected account's `accountId`, `connectionId`, `displayName`, and `displayImage` through the Neup auth bridge using environment-provided application credentials.

::public end

::private

The module intentionally depends only on `fetch`, `URL`, and the three required environment variables so the folder can move to another app without local service dependencies.

::private end

::end
*/

export type NeupConnectionAccountInfo = {
  accountId: string;
  connectionId: string;
  displayName: string;
  displayImage: string | null;
};

type BridgeConfig = {
  appId: string;
  appSecret: string;
  authUrl: string;
};

type SignAndGetResponse = {
  success?: boolean;
  error?: string;
  account?: {
    id?: unknown;
    connectionId?: unknown;
  };
  profile?: {
    displayName?: unknown;
    displayImage?: unknown;
  };
};

function requireEnv(name: 'NEUP_APP_ID' | 'NEUP_APP_SECRET' | 'NEUP_AUTH_URL'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

/**
 * ::neup.documentation::logica-account-bridge-config
 * ::function getNeupAccountBridgeConfig()
 *
 * Returns the environment-backed bridge credentials for account lookups.
 *
 * ::public
 *
 * The helper requires `NEUP_APP_ID`, `NEUP_APP_SECRET`, and `NEUP_AUTH_URL` with no fallback variable names.
 *
 * ::public end
 *
 * ::private
 *
 * Consumers should call this through the exported account lookup helpers rather than reading environment variables repeatedly.
 *
 * ::private end
 *
 * ::end
 */
export function getNeupAccountBridgeConfig(): BridgeConfig {
  return {
    appId: requireEnv('NEUP_APP_ID'),
    appSecret: requireEnv('NEUP_APP_SECRET'),
    authUrl: requireEnv('NEUP_AUTH_URL'),
  };
}

function getSignAndGetUrl(authUrl: string): string {
  return new URL('/bridge/api.v1/connection/sign&get', authUrl).toString();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseNeupConnectionAccountInfo(body: SignAndGetResponse): NeupConnectionAccountInfo {
  const accountId = asNonEmptyString(body.account?.id);
  const connectionId = asNonEmptyString(body.account?.connectionId);
  const displayName = asNonEmptyString(body.profile?.displayName);
  const rawDisplayImage = body.profile?.displayImage;

  if (!accountId) {
    throw new Error('Bridge response is missing account.id. Configure the application response fields to include accountId.');
  }

  if (!connectionId) {
    throw new Error('Bridge response is missing account.connectionId.');
  }

  if (!displayName) {
    throw new Error('Bridge response is missing profile.displayName. Configure the application response fields to include displayName.');
  }

  if (rawDisplayImage !== null && rawDisplayImage !== undefined && typeof rawDisplayImage !== 'string') {
    throw new Error('Bridge response returned an invalid profile.displayImage value.');
  }

  return {
    accountId,
    connectionId,
    displayName,
    displayImage: typeof rawDisplayImage === 'string' ? rawDisplayImage : null,
  };
}

/**
 * ::neup.documentation::logica-account-get-connection-account-info
 * ::function getNeupConnectionAccountInfo(authAccountToken)
 *
 * Resolves the connected account identity snapshot for one `auth_account` token.
 *
 * ::public
 *
 * The helper calls `NEUP_AUTH_URL + /bridge/api.v1/connection/sign&get` with `NEUP_APP_ID` and `NEUP_APP_SECRET`, then returns `accountId`, `connectionId`, `displayName`, and `displayImage`.
 *
 * ::public end
 *
 * ::private
 *
 * The request sends the supplied token only through the `Cookie` header because the bridge route expects `auth_account` as a cookie.
 *
 * ::private end
 *
 * ::param external authAccountToken
 * ::datatype string
 * ::required true
 *
 * The signed `auth_account` cookie token for the currently authenticated account.
 *
 * ::returns Promise<NeupConnectionAccountInfo>
 *
 * The normalized account identity snapshot returned by the bridge.
 *
 * ::end
 */
export async function getNeupConnectionAccountInfo(
  authAccountToken: string,
): Promise<NeupConnectionAccountInfo> {
  const token = authAccountToken.trim();
  if (!token) {
    throw new Error('authAccountToken is required.');
  }

  const { appId, appSecret, authUrl } = getNeupAccountBridgeConfig();
  const response = await fetch(getSignAndGetUrl(authUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `auth_account=${token}`,
    },
    body: JSON.stringify({
      appId,
      appSecret,
    }),
    cache: 'no-store',
  });

  let body: SignAndGetResponse | null = null;
  try {
    body = (await response.json()) as SignAndGetResponse;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const bridgeError = asNonEmptyString(body?.error) ?? `HTTP ${response.status}`;
    throw new Error(`Neup account bridge request failed: ${bridgeError}`);
  }

  if (!body?.success) {
    const bridgeError = asNonEmptyString(body?.error) ?? 'unknown_error';
    throw new Error(`Neup account bridge request failed: ${bridgeError}`);
  }

  return parseNeupConnectionAccountInfo(body);
}

/**
 * ::neup.documentation::logica-account-get-account-id
 * ::function getNeupAccountId(authAccountToken)
 *
 * Returns the connected account ID for one `auth_account` token.
 *
 * ::public
 *
 * This is a convenience wrapper around `getNeupConnectionAccountInfo()`.
 *
 * ::public end
 *
 * ::end
 */
export async function getNeupAccountId(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.accountId;
}

/**
 * ::neup.documentation::logica-account-get-connection-id
 * ::function getNeupConnectionId(authAccountToken)
 *
 * Returns the connected application-connection ID for one `auth_account` token.
 *
 * ::public
 *
 * This is a convenience wrapper around `getNeupConnectionAccountInfo()`.
 *
 * ::public end
 *
 * ::end
 */
export async function getNeupConnectionId(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.connectionId;
}

/**
 * ::neup.documentation::logica-account-get-display-name
 * ::function getNeupDisplayName(authAccountToken)
 *
 * Returns the connected account display name for one `auth_account` token.
 *
 * ::public
 *
 * This is a convenience wrapper around `getNeupConnectionAccountInfo()`.
 *
 * ::public end
 *
 * ::end
 */
export async function getNeupDisplayName(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.displayName;
}

/**
 * ::neup.documentation::logica-account-get-display-image
 * ::function getNeupDisplayImage(authAccountToken)
 *
 * Returns the connected account display image for one `auth_account` token.
 *
 * ::public
 *
 * This is a convenience wrapper around `getNeupConnectionAccountInfo()`.
 *
 * ::public end
 *
 * ::end
 */
export async function getNeupDisplayImage(authAccountToken: string): Promise<string | null> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.displayImage;
}
