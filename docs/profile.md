# External App — Profile & Accessible Accounts API

This page describes the endpoints an **external application server** can call to retrieve:

- `accessibleAccounts`
- `accessibleBrandAccounts`
- `accessibleDependentAccounts`

These endpoints return the accounts the user has access to (including delegated contexts), plus the permissions the user holds on each account.

**Base URL:** `https://neupgroup.com/account`

---

## Authentication (required)

These endpoints are meant for **server-to-server** usage by your application backend.

You must provide both:

1. `token` — a signed JWT (issued for your application)
2. `appSecret` — your application's secret

### Token source

Use `POST /account/bridge/api.v1/auth/token` to issue the JWT (server-to-server).
That token is scoped to your app and is safe to use as an API bearer token.

### How to send credentials

- Send `token` as a Bearer token:
  - `Authorization: Bearer <token>`
- Send `appSecret` in either:
  - header `x-app-secret: <appSecret>` (recommended), or
  - query param `?appSecret=<appSecret>`

If either credential is missing or invalid, the API responds with `401`.

---

## 1) accessibleAccounts

Returns all accounts the user can access (individual, brand, branch, dependent, delegated, etc.).

```http
GET /account/bridge/api.v1/accounts
Authorization: Bearer <token>
x-app-secret: <appSecret>
```

**Response (200)**

```json
{
  "success": true,
  "accounts": [
    {
      "id": "acct_...",
      "displayName": "Jane Smith",
      "displayImage": "https://...",
      "status": "active",
      "isVerified": true,
      "accountType": "individual",
      "permissions": ["..."]
    }
  ]
}
```

---

## 2) accessibleBrandAccounts

Returns only brand and branch accounts the user can access.

```http
GET /account/bridge/api.v1/accounts/brands
Authorization: Bearer <token>
x-app-secret: <appSecret>
```

**Response (200)** uses the same `accounts[]` shape as above.

---

## 3) accessibleDependentAccounts

Returns only dependent accounts the user can access.

```http
GET /account/bridge/api.v1/accounts/dependents
Authorization: Bearer <token>
x-app-secret: <appSecret>
```

**Response (200)** uses the same `accounts[]` shape as above.

---

## Notes

- These endpoints are for **external apps**. Do not call them directly from browser JavaScript.
- Permissions are returned as denormalized strings for easy client-side checks.

