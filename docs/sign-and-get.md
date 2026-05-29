# `sign&get` Endpoint Guide

This guide explains how to use:

- `POST /account/bridge/api.v1/connection/sign&get`

This endpoint signs in by validating the `auth_account` cookie session and returns structured app/account/profile data plus a JWT token.

## Endpoint

- Method: `POST`
- URL: `https://neupgroup.com/account/bridge/api.v1/connection/sign&get`
- Content-Type: `application/json`

Only `POST` is supported. All other methods return:

- `405 method_not_allowed`

## Who Can Use It

The application must be:

- `party = 0` (Internal) or
- `party = 1` (Partnerships)

If app party is not `0` or `1`, response is:

- `403` with permission error

## Required Inputs

### 1. Cookie (mandatory)

Request must include:

- `auth_account` cookie

The server verifies:

1. Cookie token validity
2. Backing signin session validity (`aid` + `sid` + `skey`) in database

So JWT cookie validity alone is not enough.

### 2. Request Body (mandatory)

```json
{
  "appId": "your-app-id",
  "appSecret": "your-app-secret"
}
```

Both fields are required.

## Example Request

### Server-side fetch (recommended)

```ts
const res = await fetch("https://neupgroup.com/account/bridge/api.v1/connection/sign&get", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // Forward incoming cookie from your server request context
    "Cookie": `auth_account=${authAccountCookie}`,
  },
  body: JSON.stringify({
    appId: "neup.appid",
    appSecret: "app_secret_here",
  }),
});

const data = await res.json();
```

### cURL example

```bash
curl -X POST "https://neupgroup.com/account/bridge/api.v1/connection/sign&get" \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_account=YOUR_AUTH_ACCOUNT_COOKIE" \
  -d '{
    "appId": "neup.appid",
    "appSecret": "app_secret_here"
  }'
```

## Success Response Format

The endpoint returns this shape:

```json
{
  "success": true,
  "appId": "neup.appid",
  "occurredAt": "2026-05-30T10:12:00.000Z",
  "account": {
    "id": "accid",
    "connectionId": "connection-id",
    "isMinor": false,
    "neupid": "neupid"
  },
  "profile": {
    "displayName": "Kishor Neupane",
    "displayImage": "imageUrl",
    "gender": "male",
    "birthDate": "1998-01-15T00:00:00.000Z",
    "lastActive": "2026-05-30T09:59:00.000Z"
  },
  "role": {
    "id": "role_id",
    "name": "role_name"
  },
  "token": "jwt-token"
}
```

### Field filtering behavior

- If a field is not selected in app config, it is removed.
- If a field has no value, it is removed.
- `account.connectionId` is always present.
- `profile` and `role` are omitted when empty.

## Error Responses

Common errors:

- `400` invalid request body / missing `appId` / missing `appSecret`
- `401` missing or invalid `auth_account` cookie
- `401` invalid or expired signin session
- `401` invalid app secret
- `403` app is not allowed by party check
- `403` app is blocked/rejected
- `404` app or profile not found
- `405` method not allowed

## Important Notes

- Use this endpoint from server-side code where possible.
- Do not expose app secrets in browser-only integrations.
- Always send the real user cookie from the authenticated request context.
