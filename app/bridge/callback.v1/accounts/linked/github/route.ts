import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { makeAppPath } from '#/core/appconfig';
import { getEnvVariable } from '@/.neup/core/helpers/env';
import { getActiveSession } from '@/services/account/verify';
import { storeLinkedAccount } from '@/services/bridge/linked-accounts';

export const dynamic = 'force-dynamic';

/*
::neup.documentation::bridge-callback-linked-github-route
::api GET|POST /bridge/callback.v1/accounts/linked/github
::title Bridge Linked GitHub Callback

Accepts GitHub linked-account callback payloads and stores them for later processing.

::public

This endpoint accepts query parameters, JSON bodies, and form submissions. The full callback payload is stored without waiting for downstream processing to complete.

Pass `ownerId` in the callback payload when there is no active `auth_account` session. `connectedBy` is optional and falls back to the signed-in account, then to `ownerId`.

::public end

::private

The route persists the callback payload, then redirects the browser back to the linked-accounts page. The full inbound payload is stored in `linked_accounts.token_data`.

::private end

::end
*/

type CallbackPayload = Record<string, unknown>;
type DecodedStatePayload = {
  nonce: string;
  ownerId: string;
  connectedBy: string;
  issuedAt: number;
};

const STATE_COOKIE_NAME = 'github_link_state';

function normalizeBasePath(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
}

function getConfiguredAppBasePath(): string {
  return normalizeBasePath(getEnvVariable('APP_BASEPATH', true));
}

function buildReturnUrl(
  request: NextRequest,
  options: {
    ownerId?: string | null;
    status: 'success' | 'error';
    error?: string;
  },
): URL {
  const basePath = getConfiguredAppBasePath();
  const url = new URL(makeAppPath('/access/link', basePath), request.nextUrl.origin);
  if (options.ownerId) url.searchParams.set('selectedProfile', options.ownerId);
  url.searchParams.set('github', options.status);
  if (options.error) url.searchParams.set('error', options.error);
  return url;
}

function redirectToLinkPage(
  request: NextRequest,
  options: {
    ownerId?: string | null;
    status: 'success' | 'error';
    error?: string;
    clearStateCookie?: boolean;
  },
) {
  const response = NextResponse.redirect(buildReturnUrl(request, options));
  if (options.clearStateCookie) {
    response.cookies.delete(STATE_COOKIE_NAME);
  }
  return response;
}

function normalizeKey(input: string): string {
  return input.replace(/[_-]/g, '').toLowerCase();
}

function readNormalizedString(payload: CallbackPayload, ...keys: string[]): string | null {
  const normalizedTargets = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(payload)) {
    if (!normalizedTargets.has(normalizeKey(key))) continue;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function collectSearchParams(searchParams: URLSearchParams): CallbackPayload {
  const payload: CallbackPayload = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    payload[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  return payload;
}

function decodeState(state: string, secret: string): DecodedStatePayload | null {
  const [encodedBody, signature] = state.split('.', 2);
  if (!encodedBody || !signature) return null;

  const body = Buffer.from(encodedBody, 'base64url').toString('utf8');
  const expectedSignature = createHmac('sha256', secret).update(body).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object') return null;

  const payload = parsed as Partial<DecodedStatePayload>;
  if (
    typeof payload.nonce !== 'string' ||
    typeof payload.ownerId !== 'string' ||
    typeof payload.connectedBy !== 'string' ||
    typeof payload.issuedAt !== 'number'
  ) {
    return null;
  }

  return {
    nonce: payload.nonce,
    ownerId: payload.ownerId,
    connectedBy: payload.connectedBy,
    issuedAt: payload.issuedAt,
  };
}

async function readRequestPayload(request: NextRequest): Promise<CallbackPayload> {
  if (request.method === 'GET') {
    return collectSearchParams(request.nextUrl.searchParams);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as CallbackPayload
      : {};
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return {};

    const payload: CallbackPayload = {};
    for (const key of new Set(formData.keys())) {
      const values = formData.getAll(key).map((value) => typeof value === 'string' ? value : value.name);
      payload[key] = values.length > 1 ? values : (values[0] ?? '');
    }
    return payload;
  }

  const text = await request.text().catch(() => '');
  return text ? { raw: text } : {};
}

function buildMoreDetails(request: NextRequest, queryPayload: CallbackPayload, bodyPayload: CallbackPayload) {
  return {
    source: 'bridge.callback.v1.accounts.linked.github',
    method: request.method,
    path: request.nextUrl.pathname,
    receivedAt: new Date().toISOString(),
    query: queryPayload,
    contentType: request.headers.get('content-type'),
    userAgent: request.headers.get('user-agent'),
    forwardedFor: request.headers.get('x-forwarded-for'),
    bodyKeys: Object.keys(bodyPayload),
  };
}

async function persistCallback(request: NextRequest) {
  const session = await getActiveSession();
  const queryPayload = collectSearchParams(request.nextUrl.searchParams);
  const bodyPayload = await readRequestPayload(request);
  const payload: CallbackPayload = {
    ...queryPayload,
    ...bodyPayload,
  };
  const stateSecret = process.env.GITHUB_SESSION_SECRET?.trim();
  const returnedState = readNormalizedString(payload, 'state');
  const expectedState = request.cookies.get(STATE_COOKIE_NAME)?.value ?? null;

  if (!stateSecret || !returnedState || !expectedState || returnedState !== expectedState) {
    return redirectToLinkPage(request, {
      status: 'error',
      error: 'invalid_state',
      clearStateCookie: true,
    });
  }

  const decodedState = decodeState(returnedState, stateSecret);
  if (!decodedState) {
    return redirectToLinkPage(request, {
      status: 'error',
      error: 'invalid_state',
      clearStateCookie: true,
    });
  }

  const ownerId =
    decodedState.ownerId
    ?? readNormalizedString(payload, 'ownerId', 'owner_id', 'accountId', 'account_id', 'aid')
    ?? session?.accountId
    ?? null;

  if (!ownerId) {
    return redirectToLinkPage(request, {
      status: 'error',
      error: 'invalid_request',
      clearStateCookie: true,
    });
  }

  const connectedBy =
    decodedState.connectedBy
    ?? readNormalizedString(payload, 'connectedBy', 'connected_by')
    ?? session?.accountId
    ?? ownerId;

  const result = await storeLinkedAccount({
    platform: 'github',
    ownerId,
    connectedBy,
    tokenData: payload,
    moreDetails: buildMoreDetails(request, queryPayload, bodyPayload),
  });

  if (!result.success) {
    return redirectToLinkPage(request, {
      ownerId,
      status: 'error',
      error: result.error,
      clearStateCookie: true,
    });
  }

  return redirectToLinkPage(request, {
    ownerId,
    status: 'success',
    clearStateCookie: true,
  });
}

export async function GET(request: NextRequest) {
  return persistCallback(request);
}

export async function POST(request: NextRequest) {
  return persistCallback(request);
}
