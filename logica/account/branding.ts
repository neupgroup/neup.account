/*
::neup.documentation::logica-account-branding-module
::title Logica Branding Route Helpers

Portable wrappers for bridge branding routes.

::public

Use this module for `/bridge/api.v1/branding/logo`.

::public end

::end
*/

import { runNeupBridgeApi, type NeupBridgeResponse } from '@/logica/core/api-runner';

export async function getBridgeBrandingLogo(): Promise<NeupBridgeResponse> {
  return runNeupBridgeApi({
    path: '/bridge/api.v1/branding/logo',
    method: 'GET',
  });
}
