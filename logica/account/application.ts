/*
::neup.documentation::logica-account-application-module
::title Logica Application Route Helpers

Portable wrappers for bridge application and app-catalog routes.

::public

Use this module for `/bridge/api.v1/application/*` exports and `/bridge/api.v1/app/*` sync routes.

::public end

::end
*/

import { getNeupBridgeEnvironment, runNeupBridgeApi, type NeupBridgeQuery, type NeupBridgeResponse } from '@/logica/core/api-runner';

function getApplicationCredentials(input?: { app?: string; appSecret?: string }) {
  const env = getNeupBridgeEnvironment();
  return {
    app: input?.app?.trim() || env.appId,
    appSecret: input?.appSecret?.trim() || env.appSecret,
  };
}

function withApplicationQuery(
  query: NeupBridgeQuery = {},
  input?: { app?: string; appSecret?: string },
): NeupBridgeQuery {
  const credentials = getApplicationCredentials(input);
  return {
    ...query,
    app: credentials.app,
    appSecret: credentials.appSecret,
  };
}

export async function getBridgeApplicationAccess(input: {
  app?: string;
  appSecret?: string;
  start?: string | number;
  end?: string | number;
  startFrom?: string;
  limit?: string | number;
  fromDate?: string;
  toDate?: string;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/application/access',
    method: 'GET',
    query: withApplicationQuery(input, input),
  });
}

export async function postBridgeApplicationAccess(input: {
  accountId: string;
  forAccount?: string;
  app?: string;
  appSecret?: string;
  start?: string | number;
  end?: string | number;
  startFrom?: string;
  limit?: string | number;
  fromDate?: string;
  toDate?: string;
}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/application/access',
    method: 'POST',
    query: withApplicationQuery(
      {
        start: input.start,
        end: input.end,
        startFrom: input.startFrom,
        limit: input.limit,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
      input,
    ),
    body: {
      accountId: input.accountId,
      forAccount: input.forAccount,
    },
  });
}

export async function getBridgeApplicationRoles(input: {
  app?: string;
  appSecret?: string;
  account?: string;
  start?: string | number;
  end?: string | number;
  startFrom?: string;
  limit?: string | number;
  fromDate?: string;
  toDate?: string;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/application/roles',
    method: 'GET',
    query: withApplicationQuery(input, input),
  });
}

export async function postBridgeApplicationUsers(input: {
  app?: string;
  appSecret?: string;
  offset?: string | number;
  limit?: string | number;
  start?: string | number;
  end?: string | number;
  startFrom?: string;
  fromDate?: string;
  toDate?: string;
  headers?: HeadersInit;
} = {}): Promise<NeupBridgeResponse> {
  const credentials = getApplicationCredentials(input);
  return runNeupBridgeApi({
    path: '/bridge/api.v1/application/users',
    method: 'POST',
    query: {
      offset: input.offset,
      limit: input.limit,
      start: input.start,
      end: input.end,
      startFrom: input.startFrom,
      fromDate: input.fromDate,
      toDate: input.toDate,
    },
    body: {
      appId: credentials.app,
      appSecret: credentials.appSecret,
    },
    headers: input.headers,
  });
}

function getSyncCredentials() {
  const env = getNeupBridgeEnvironment();
  return {
    neup_app_id: env.appId,
    neup_app_secret: env.appSecret,
  };
}

export async function getBridgeAppPermissions(): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/app/permissions',
    method: 'GET',
    query: getSyncCredentials(),
  });
}

export async function postBridgeAppPermissions(
  permissions: unknown,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/app/permissions',
    method: 'POST',
    body: {
      ...getSyncCredentials(),
      permissions,
    },
  });
}

export async function getBridgeAppRoles(): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/app/roles',
    method: 'GET',
    query: getSyncCredentials(),
  });
}

export async function postBridgeAppRoles(roles: unknown): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/app/roles',
    method: 'POST',
    body: {
      ...getSyncCredentials(),
      roles,
    },
  });
}
