/*
::neup.documentation::logica-core-api-runner-module
::title Logica Bridge API Runner

Shared fetch runner for Neup bridge API calls from portable `logica` helpers.

::public

Use this module to build bridge URLs, read required environment variables, and execute JSON-oriented bridge requests from `logica/auth` and `logica/account`.

::public end

::private

The runner intentionally depends only on standard web APIs and the three required Neup environment variables so it can move between apps without service-layer imports.

::private end

::end
*/

export type NeupBridgeEnvironment = {
  appId: string;
  appSecret: string;
  authUrl: string;
};

export type NeupBridgeMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type NeupBridgeQuery = Record<string, string | number | boolean | null | undefined>;

export type NeupBridgeResponse<TBody = unknown> = {
  ok: boolean;
  status: number;
  body: TBody;
  headers: Headers;
};

export type NeupBridgeRequestOptions = {
  path: string;
  method?: NeupBridgeMethod;
  query?: NeupBridgeQuery;
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  headers?: HeadersInit;
  authAccountToken?: string | null;
  bearerToken?: string | null;
};

function requireEnv(name: 'NEUP_APP_ID' | 'NEUP_APP_SECRET' | 'NEUP_AUTH_URL'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

/**
 * ::neup.documentation::logica-core-api-runner-env
 * ::function getNeupBridgeEnvironment()
 *
 * Returns the required bridge environment values.
 *
 * ::public
 *
 * The helper reads only `NEUP_APP_ID`, `NEUP_APP_SECRET`, and `NEUP_AUTH_URL`.
 *
 * ::public end
 *
 * ::private
 *
 * No fallback environment variable names are accepted here on purpose.
 *
 * ::private end
 *
 * ::end
 */
export function getNeupBridgeEnvironment(): NeupBridgeEnvironment {
  return {
    appId: requireEnv('NEUP_APP_ID'),
    appSecret: requireEnv('NEUP_APP_SECRET'),
    authUrl: requireEnv('NEUP_AUTH_URL'),
  };
}

/**
 * ::neup.documentation::logica-core-api-runner-url
 * ::function createNeupBridgeUrl(path, query)
 *
 * Builds an absolute bridge URL from the configured auth base URL.
 *
 * ::public
 *
 * Query parameters with `null`, `undefined`, or empty-string values are omitted.
 *
 * ::public end
 *
 * ::end
 */
export function createNeupBridgeUrl(path: string, query?: NeupBridgeQuery): string {
  const { authUrl } = getNeupBridgeEnvironment();
  const url = new URL(path, authUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCookieHeader(existingCookieHeader: string | null, authAccountToken: string): string {
  const nextCookie = `auth_account=${authAccountToken}`;
  if (!existingCookieHeader?.trim()) {
    return nextCookie;
  }

  return `${existingCookieHeader.trim()}; ${nextCookie}`;
}

async function parseBridgeResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => '');
}

/**
 * ::neup.documentation::logica-core-api-runner-run
 * ::function runNeupBridgeApi(options)
 *
 * Executes one bridge API request and returns the parsed response.
 *
 * ::public
 *
 * JSON objects and arrays are stringified automatically and sent with `content-type: application/json`.
 *
 * ::public end
 *
 * ::private
 *
 * `authAccountToken` is always sent via the `Cookie` header and `bearerToken` is always sent via `Authorization: Bearer`.
 *
 * ::private end
 *
 * ::end
 */
export async function runNeupBridgeApi<TBody = unknown>(
  options: NeupBridgeRequestOptions,
): Promise<NeupBridgeResponse<TBody>> {
  const method = options.method ?? 'GET';
  const url = createNeupBridgeUrl(options.path, options.query);
  const headers = new Headers(options.headers);

  if (options.bearerToken?.trim()) {
    headers.set('authorization', `Bearer ${options.bearerToken.trim()}`);
  }

  if (options.authAccountToken?.trim()) {
    headers.set(
      'cookie',
      normalizeCookieHeader(headers.get('cookie'), options.authAccountToken.trim()),
    );
  }

  let requestBody: BodyInit | undefined;
  if (options.body !== undefined && options.body !== null) {
    if (Array.isArray(options.body) || isPlainObject(options.body)) {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      requestBody = JSON.stringify(options.body);
    } else {
      requestBody = options.body;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
    cache: 'no-store',
  });

  const body = (await parseBridgeResponseBody(response)) as TBody;

  return {
    ok: response.ok,
    status: response.status,
    body,
    headers: response.headers,
  };
}
