/*
::neup.documentation::logica-account-profile-module
::title Logica Profile Route Helpers

Portable wrappers for public bridge profile and permission routes.

::public

Use this module for `/bridge/api.v1/profile`, `/bridge/api.v1/profile/public`, `/bridge/api.v1/profile/signed`, and `/bridge/api.v1/permissions`.

::public end

::end
*/

import { runNeupBridgeApi, type NeupBridgeResponse } from '@/logica/core/api-runner';

export async function getBridgeProfile(input: {
  tempToken?: string;
  appId?: string;
  requestedAid?: string;
  requestedNeupId?: string;
  aid?: string;
  sid?: string;
  skey?: string;
} = {}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/profile',
    method: 'GET',
    query: {
      tempToken: input.tempToken,
      appId: input.appId,
      aid: input.requestedAid,
      neupid: input.requestedNeupId,
    },
    headers: {
      ...(input.aid ? { aid: input.aid } : {}),
      ...(input.sid ? { sid: input.sid } : {}),
      ...(input.skey ? { skey: input.skey } : {}),
    },
  });
}

export async function getPublicBridgeProfile(input: {
  accountId: string;
  authAccountToken: string;
}): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/profile/public',
    method: 'GET',
    query: { accountId: input.accountId },
    authAccountToken: input.authAccountToken,
  });
}

export async function getSignedBridgeProfile(
  authAccountToken: string,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/profile/signed',
    method: 'GET',
    authAccountToken,
  });
}

export async function getBridgePermissions(
  authAccountToken: string,
): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/permissions',
    method: 'GET',
    authAccountToken,
  });
}
