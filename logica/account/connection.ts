/*
::neup.documentation::logica-account-connection-module
::title Logica Connection Route Helpers

Portable wrappers for bridge connection sign-and-get helpers.

::public

Use this module when an app needs a normalized connected-account identity snapshot from `/bridge/api.v1/connection/sign&get`.

::public end

::end
*/

import { getNeupBridgeEnvironment, runNeupBridgeApi, type NeupBridgeResponse } from '@/logica/core/api-runner';

export type NeupConnectionAccountInfo = {
  accountId: string;
  connectionId: string;
  displayName: string;
  displayImage: string | null;
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

export async function postBridgeConnectionSignAndGet(
  authAccountToken: string,
): Promise<NeupBridgeResponse<SignAndGetResponse>> {
  const token = authAccountToken.trim();
  if (!token) {
    throw new Error('authAccountToken is required.');
  }

  const env = getNeupBridgeEnvironment();
  return runNeupBridgeApi<SignAndGetResponse>({
    path: '/bridge/api.v1/connection/sign&get',
    method: 'POST',
    authAccountToken: token,
    body: {
      appId: env.appId,
      appSecret: env.appSecret,
    },
  });
}

export async function getNeupConnectionAccountInfo(
  authAccountToken: string,
): Promise<NeupConnectionAccountInfo> {
  const response = await postBridgeConnectionSignAndGet(authAccountToken);
  const body = response.body;

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

export async function getNeupAccountId(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.accountId;
}

export async function getNeupConnectionId(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.connectionId;
}

export async function getNeupDisplayName(authAccountToken: string): Promise<string> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.displayName;
}

export async function getNeupDisplayImage(authAccountToken: string): Promise<string | null> {
  const info = await getNeupConnectionAccountInfo(authAccountToken);
  return info.displayImage;
}
