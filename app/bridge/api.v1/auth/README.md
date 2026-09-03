# Auth API

Bridge authentication endpoints for redirect grants, session verification, token issuance, validation, expiry, and access snapshots.

## Shared Rules

- Pass the application as `app`; requests using `appId` are rejected on routes that validate this explicitly.
- Route handlers in this folder should stay contract-focused and delegate logic into `services/auth/*` or `core/auth/*`.
- External app flows use app-scoped sessions and HS256 tokens tied to `Application.appSecret`.
- First-party account-token flows continue to use the base account token validators where the route permits both modes.

## Quick Chooser

| Need | Route | Owner |
| --- | --- | --- |
| browser redirect into app sign-in | `GET /bridge/handshake.v1/auth/grant` | `core/auth/handshake.ts` |
| exchange a one-time `tempToken` for app session credentials | `POST /bridge/api.v1/auth/grant` | `services/auth/grant.ts` |
| refresh an app grant | `PATCH /bridge/api.v1/auth/grant` | `services/auth/grant.ts` |
| check whether an app grant is still valid | `GET /bridge/api.v1/auth/grant` | `services/auth/grant.ts` |
| validate or refresh an internal session triplet | `POST /bridge/api.v1/auth/session` | `services/auth/session.ts` |
| invalidate an internal session triplet | `DELETE /bridge/api.v1/auth/session` | `services/auth/session.ts` |
| issue an app bearer token from `aid/sid/skey` | `POST /bridge/api.v1/auth/token` | `services/auth/accountJwt.ts` |
| validate a base or app token | `POST /bridge/api.v1/auth/validate` | `services/auth/bridgeToken.ts` |
| expire a base or app token session | `POST /bridge/api.v1/auth/expire` | `services/auth/bridgeToken.ts` |
| produce app/team/access snapshot for a session | `GET|POST|PATCH /bridge/api.v1/auth/access` | `services/auth/access.ts` |
| sign into an application from an existing trusted account session | `POST /bridge/api.v1/auth/sign` | `services/auth/sign.ts` |
| verify an internal session triplet | `POST /bridge/api.v1/auth/verify` | `services/auth/verify.ts` |
| hydrate the current first-party account session | `GET /bridge/api.v1/auth/me` | `services/account/check.ts` |
| describe the active user from bridge auth | `GET /bridge/api.v1/auth/whoami`, `GET /bridge/api.v1/auth/whoisthis` | `services/auth/whoami.ts`, `services/auth/whoami.ts` |
| start bridge sign-in and resolve a NeupID | `GET|POST /bridge/api.v1/auth/signin` | `services/auth/bridge-signin.ts` |

## Core Contracts

### Redirect Handshake

- Entry route: `GET /bridge/handshake.v1/auth/grant`
- Input: `app`, `authenticatesTo`, plus passthrough query params
- Behavior: ensures guest identity, resolves user sign-in, and redirects to the app callback with a short-lived `tempToken`

### Grant Exchange

- Exchange route: `POST /bridge/api.v1/auth/grant`
- Required body: `tempToken`, `app`
- Result: app-scoped session triplet (`aid`, `sid`, `skey`) plus signed app token (`token`, legacy `jwt`)

### Session Triplet

The internal session routes use the auth triplet:

- `aid`
- `sid`
- `skey`

These routes are the source of truth for internal keepalive and logout behavior.

### Access Snapshot

`/bridge/api.v1/auth/access` resolves roles and permission names from the shared access model for the requested app scope. The route supports:

- `GET` for current snapshot lookup
- `POST` for initial access-member grant creation
- `PATCH` for additive/removal role changes

::neup.documentation::bridge-auth-folder
::title Bridge Auth Folder Documentation

Authentication routes for redirect grants, app sessions, token lifecycles, and auth access snapshots.

::public

Use the handshake route to start browser auth, the grant route to exchange the returned `tempToken`, and the token/session routes for later server-side verification and refresh.

::public end

::private

The implementation split is deliberate: route files hold contract validation, `core/auth` owns browser-handshake concerns, and `services/auth` owns token/session/access business logic. Document new auth flows here and in source comments on the owning service when the contract becomes nontrivial.

::private end

::end
