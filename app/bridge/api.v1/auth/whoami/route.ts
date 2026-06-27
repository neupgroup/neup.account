// Deprecated: use /bridge/api.v1/auth/whoisthis instead.
// Keep this file as a compatibility wrapper.
export const dynamic = 'force-dynamic';

/*
::neup.documentation::bridge-auth-whoami-compat-endpoint
::api GET /bridge/api.v1/auth/whoami

Compatibility wrapper for the newer `whoisthis` route.

::public

This route remains only for backwards compatibility and delegates to `/bridge/api.v1/auth/whoisthis`.

::public end

::private

No separate implementation should be added here. The source of truth is the `whoisthis` route.

::private end

::end
*/
export { GET, OPTIONS } from '../whoisthis/route';
