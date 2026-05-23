# Application APIs (External App Server)

This page is a quick index of the **Application APIs** that external apps can call to understand:

- which users have connected to their application
- which roles exist for the application
- which access grants (who → what role) exist for the application

If you need the full response schemas and pagination details, also see `docs/external-app-api.md`.

**Base URL:** `https://neupgroup.com/account`

---

## Authentication (required)

All endpoints on this page require your application credentials passed as query parameters:

- `app` — your application ID
- `appSecret` — your application secret

Requests with invalid credentials are rejected with `401`.

---

## Endpoints

### 1) List connected users

**Purpose:** returns accounts that have connected to your application (ApplicationConnection-based list) with basic profile columns.

```http
GET /account/bridge/api.v1/application/users
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
```

Optional query parameters:

- Pagination:
  - Offset: `start`, `end`
  - Cursor: `startFrom`, `limit`
- Date filter (filters on `connectedAt`): `fromDate=YYYY-MM-DD`, `toDate=YYYY-MM-DD`

Pagination examples:

```http
# Offset pagination (first 100 rows)
GET /account/bridge/api.v1/application/users
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &start=0
  &end=100
```

```http
# Cursor pagination (next page) — use meta.endedAt from the previous response
GET /account/bridge/api.v1/application/users
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &startFrom=<connectionId>
  &limit=100
```

```http
# Date filtered (connectedAt)
GET /account/bridge/api.v1/application/users
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &fromDate=2025-01-01
  &toDate=2026-01-01
```

---

### 2) List roles for your application

**Purpose:** returns roles defined for your application with permissions denormalized on each role.

```http
GET /account/bridge/api.v1/application/roles
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
```

Optional query parameters:

- Pagination:
  - Offset: `start`, `end`
  - Cursor: `startFrom`, `limit`
- Optional filter:
  - `account` — when provided, returns only roles that have been granted to that account within this application.

Pagination examples:

```http
# Offset pagination
GET /account/bridge/api.v1/application/roles
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &start=0
  &end=100
```

```http
# Cursor pagination (next page) — use meta.endedAt from the previous response
GET /account/bridge/api.v1/application/roles
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &startFrom=<roleId>
  &limit=100
```

```http
# Roles granted to one account in this app
GET /account/bridge/api.v1/application/roles
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &account=<accountId>
```

---

### 3) List access grants for your application

**Purpose:** returns access grants within your application scope — who has been granted what role (and the role’s permissions).

```http
GET /account/bridge/api.v1/application/access
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
```

Optional query parameters:

- Pagination:
  - Offset: `start`, `end`
  - Cursor: `startFrom`, `limit`

Pagination examples:

```http
# Offset pagination
GET /account/bridge/api.v1/application/access
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &start=0
  &end=100
```

```http
# Cursor pagination (next page) — use meta.endedAt from the previous response
GET /account/bridge/api.v1/application/access
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
  &startFrom=<grantId>
  &limit=100
```

```http
# Access grants involving one account (both directions) — body-based filter
POST /account/bridge/api.v1/application/access
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
content-type: application/json

{
  "accountId": "<accountId>"
}
```

```http
# Access grants between two accounts (either direction)
POST /account/bridge/api.v1/application/access
  ?app=YOUR_APP_ID
  &appSecret=YOUR_APP_SECRET
content-type: application/json

{
  "accountId": "<accountId>",
  "forAccount": "<otherAccountId>"
}
```
