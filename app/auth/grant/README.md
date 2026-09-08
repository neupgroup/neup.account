# Application authorization with proof

Production entry point: `GET https://neupgroup.com/account/auth/grant`.
Exchange: `POST https://neupgroup.com/account/auth/grant` (also supported by
`POST /account/bridge/api.v1/auth/grant`). Send the exchange body as JSON.

## App request

Generate a fresh cryptographically random `proof` and `state` for every authorization.
Keep both in the app until the exchange finishes. `proof` is 43–128 ASCII characters
from `A-Z a-z 0-9 - . _ ~`; 32 random bytes encoded as unpadded base64url is suitable.
`challenge = BASE64URL(SHA256(ASCII(proof)))`, without `=` padding.
Never send the proof in the authorization URL or callback.

```js
const proof = crypto.randomBytes(32).toString('base64url');
const state = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(proof, 'ascii').digest('base64url');
const params = new URLSearchParams({
  app: 'APP_ID', platform: 'android',
  authorizesTo: 'neupestate://auth/callback', state, challenge,
});
const authorizationUrl = `https://neupgroup.com/account/auth/grant?${params}`;
```

Supported platforms: `web`, `android`, `ios`, `macos`, `windows`.
Web callbacks require HTTPS. Native callbacks support HTTPS or registered custom
schemes such as `neupestate://auth/callback`. Bare package names are not URLs.
Callbacks cannot include credentials, fragments, or reserved grant query parameters.

## Callback registration

Use the existing `application_bridge` table. Register the exact callback value with:

```json
{
  "appId": "APP_ID",
  "type": "authorizesTo",
  "value": "neupestate://auth/callback",
  "details": { "platform": "android" }
}
```

Each platform can have its own registration. Existing `authenticatesTo` records are
also recognized; a legacy record with no `details.platform` applies to all supported
platforms. No wildcard, prefix, or package-name matching is performed.

Invalid requests, invalid apps, and unregistered callbacks return to NeupID's
`/account/auth/start` with an error; they never redirect to the unverified callback.
Users without an active non-guest session sign in and return to the full grant
request. As with the existing handshake, an active signed-in session authorizes the
grant without an additional consent screen.

## Callback and exchange

The callback receives `app`, `platform`, `authorizesTo`, `state`, and `tempcode`.
The app **must reject an unexpected state before accepting or exchanging the code**.
It should also check the other callback values against its original request.
Use locally retained request values for the exchange, not untrusted callback values.

```json
{
  "app": "APP_ID",
  "platform": "android",
  "authorizesTo": "neupestate://auth/callback",
  "state": "ORIGINAL_STATE",
  "tempcode": "RETURNED_CODE",
  "proof": "ORIGINAL_RANDOM_SECRET",
  "challenge": "ORIGINAL_BASE64URL_SHA256_CHALLENGE"
}
```

The server matches every context field to the stored authorization, verifies the
proof against the **stored** challenge, rechecks callback registration, and atomically
consumes the unexpired code. Incorrect proofs or context do not consume the code.
A code expires after five minutes and can succeed only once, including concurrent
exchanges. Failure returns `invalid_grant`; malformed requests return `invalid_request`.
Success returns the existing app credentials: `aid`, `sid`, `skey`, `token` (`jwt`
legacy alias), `exp`, and role/permission context. Store credentials securely.

## Storage and compatibility

Existing `authn_request` columns are sufficient. New entries use `type=proof_grant`,
`status=pending`, an SHA-256 hash of the code as `id`, the account ID, expiry, and
`data={app,platform,authorizesTo,state,challenge}`. The proof and raw code are not stored.
`database.live` already describes these columns; no schema migration is needed.

The legacy handshake retains its `authenticatesTo`/`tempToken` contract and uses the
separate `bridge_grant` request type. It cannot exchange a new proof-bound code.
New clients should use `/account/auth/grant` and the proof contract above.
