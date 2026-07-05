/*
::neup.documentation::logica-account-accounts-module
::title Logica Account Route Helpers

Portable wrappers for bridge account listing, lookup, and connection creation routes.

::public

Use this module for `/bridge/api.v1/accounts`, `/bridge/api.v1/accounts/lookup`, and account-to-application connection helpers.

::public end

::end
*/

import { getNeupBridgeEnvironment, runNeupBridgeApi, type NeupBridgeResponse } from '@/logica/core/api-runner';

type AuthAccountOrBearer = {
  authAccountToken?: string | null;
  bearerToken?: string | null;
};

export async function getBridgeAccounts(
  input: AuthAccountOrBearer = {},
): Promise<NeupBridgeResponse> {
  const headers: Record<string, string> = {};
  if (input.bearerToken?.trim()) {
    headers['x-app-secret'] = getNeupBridgeEnvironment().appSecret;
  }

  return runNeupBridgeApi({
    path: '/bridge/api.v1/accounts',
    method: 'GET',
    authAccountToken: input.authAccountToken,
    bearerToken: input.bearerToken,
    headers,
  });
}

export async function createBridgeAccountConnection(input: {
  authAccountToken: string;
  accountId: string;
  appId?: string;
  appSecret?: string;
}): Promise<NeupBridgeResponse> {
  const env = getNeupBridgeEnvironment();
  return runNeupBridgeApi({
    path: '/bridge/api.v1/accounts',
    method: 'POST',
    authAccountToken: input.authAccountToken,
    body: {
      appId: input.appId?.trim() || env.appId,
      appSecret: input.appSecret?.trim() || env.appSecret,
      accountId: input.accountId,
    },
  });
}

export async function lookupBridgeAccount(input: {
  accountId: string;
  appId?: string;
  appSecret?: string;
}): Promise<NeupBridgeResponse> {
  const env = getNeupBridgeEnvironment();
  return runNeupBridgeApi({
    path: '/bridge/api.v1/accounts/lookup',
    method: 'POST',
    body: {
      appId: input.appId?.trim() || env.appId,
      appSecret: input.appSecret?.trim() || env.appSecret,
      accountId: input.accountId,
    },
  });
}

export async function assignBridgeRoleToCurrentAccount(input: {
  authAccountToken?: string | null;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | null | undefined>;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/roles/assign.me',
    method: input.body ? 'POST' : 'GET',
    authAccountToken: input.authAccountToken,
    query: input.query,
    body: input.body,
  });
}
