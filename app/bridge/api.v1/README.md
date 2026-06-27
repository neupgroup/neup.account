# API v1

Shared API v1 bridge routes for account/profile access and auth/application subtrees.

## Shared Rules

- All route contracts in this folder are server-rendered and dynamic.
- Auth-heavy routes under `auth/` delegate to `services/auth/*`.
- Account and profile routes use either the signed-in browser session or app-issued bearer tokens, depending on the route.

## Top-Level Routes

| Route | Method | Purpose | Primary owner |
| --- | --- | --- | --- |
| `/bridge/api.v1/accounts` | `GET` | list accounts accessible to the authenticated user or bearer-token subject | `services/manage/accounts.ts`, `services/auth/appTokenAuth.ts` |
| `/bridge/api.v1/profile` | `GET` | resolve self or target profile from session headers or `tempToken` flow | `core/auth/profileBridge.ts` |
| `/bridge/api.v1/permissions` | `GET` | return current signed-in account permission set | `services/user.ts` |

::neup.documentation::bridge-api-v1-folder
::title Bridge API v1 Documentation

Top-level API v1 routes outside the auth and application subfolders.

::public

Use `/bridge/api.v1/profile` for profile reads, `/bridge/api.v1/accounts` for delegated account lists, and `/bridge/api.v1/permissions` for the current session permission snapshot.

::public end

::private

`/bridge/api.v1/profile` still resolves through `core/auth/profileBridge.ts`, while `/bridge/api.v1/accounts` can authenticate either from the active browser session or from an app bearer token plus `appSecret`.

::private end

::end
