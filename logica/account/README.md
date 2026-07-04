# Logica Account

Shared account-facing helpers that talk to the Neup auth bridge using the
application credentials stored in environment variables.

## Environment

- `NEUP_APP_ID`
- `NEUP_APP_SECRET`
- `NEUP_AUTH_URL`

## Available Helper

- `getNeupConnectionAccountInfo(authAccountToken)`:
  resolves `accountId`, `connectionId`, `displayName`, and `displayImage` for
  the signed-in `auth_account` cookie token by calling
  `NEUP_AUTH_URL + /bridge/api.v1/connection/sign&get`.

## Notes

- This module does not use fallback URLs or alternate environment variable
  names.
- The target application must expose `accountId`, `displayName`, and
  `displayImage` through its configured bridge response fields.
