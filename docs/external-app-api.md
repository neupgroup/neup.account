# External App API

This document covers the server-to-server endpoints available to external applications
for reading users, roles, and access grants scoped to their app.

**Base URL:** `https://neupgroup.com/account`

All endpoints below are relative to this base. For example:
`/bridge/api.v1/application/users` → `https://neupgroup.com/account/bridge/api.v1/application/users`

---

## Authentication

Every endpoint requires your app credentials passed as query parameters.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `app`      | yes      | Your application ID |
| `appSecret`| yes      | Your application secret |

Requests with missing or invalid credentials are rejected immediately.

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | — | `app` or `appSecret` not provided |
| 401 | `Invalid application credentials.` | Credentials do not match |

---

## Pagination

All three endpoints support the same two pagination modes. At most **100 rows**
are returned per call regardless of what you pass.

### Offset mode

Use this for the first call, or when you want to jump to a specific position.

```
?start=0&end=100
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `start`   | `0`     | Zero-based row offset |
| `end`     | `100`   | Exclusive upper bound — rows `start` through `end - 1` are returned |

### Cursor mode

Use this for subsequent pages. Pass the `endedAt` value from the previous
response as `startFrom`.

```
?startFrom=<endedAt>&limit=100
```

| Parameter   | Default | Description |
|-------------|---------|-------------|
| `startFrom` | —       | ID of the last row from the previous page |
| `limit`     | `100`   | Number of rows to return (max 100) |

### Response `meta` block

Every response includes a `meta` object:

```json
{
  "total":     843,
  "returned":  100,
  "startedAt": "<id of first row in this page>",
  "endedAt":   "<id of last row in this page>"
}
```

| Field       | Description |
|-------------|-------------|
| `total`     | Total matching rows in the database |
| `returned`  | Number of rows in this response |
| `startedAt` | ID of the first row — can be used as a bookmark |
| `endedAt`   | ID of the last row — pass as `startFrom` to get the next page |

**Iterating all rows:**

```
Page 1:  ?start=0&end=100
           → meta.endedAt = "abc123"

Page 2:  ?startFrom=abc123&limit=100
           → meta.endedAt = "def456"

Page 3:  ?startFrom=def456&limit=100
           → meta.returned < 100  →  you've reached the end
```

---

## Date filtering

The `/users` endpoint accepts optional date filters on `connectedAt`.

| Parameter  | Format       | Description |
|------------|--------------|-------------|
| `fromDate` | `YYYY-MM-DD` | Include rows on or after this date |
| `toDate`   | `YYYY-MM-DD` | Include rows on or before this date |

Both parameters are optional and can be combined.

```
?fromDate=2025-01-01&toDate=2026-01-01
```

Date filtering is not applicable to `/roles` or `/access` (those tables have
no timestamp column) — the parameters are accepted but ignored.

---

## Endpoints

### GET /bridge/api.v1/application/users

Returns accounts that have connected to your application, along with their
profile data.

**Example request:**

```http
GET /account/bridge/api.v1/application/users
  ?app=your-app-id
  &appSecret=your-app-secret
  &start=0
  &end=100
  &fromDate=2025-01-01
  &toDate=2026-01-01
```

**Response (200):**

```json
{
  "success": true,
  "columns": [
    "connectionId",
    "accountId",
    "neupId",
    "displayName",
    "displayImage",
    "accountType",
    "isVerified",
    "accountCreatedAt",
    "connectedAt",
    "connectionStatus"
  ],
  "data": [
    {
      "connectionId":     "conn-uuid",
      "accountId":        "account-uuid",
      "neupId":           "janesmith",
      "displayName":      "Jane Smith",
      "displayImage":     "https://...",
      "accountType":      "individual",
      "isVerified":       true,
      "accountCreatedAt": "2024-06-01T10:00:00.000Z",
      "connectedAt":      "2025-03-15T08:22:11.000Z",
      "connectionStatus": "active"
    }
  ],
  "meta": {
    "total":     843,
    "returned":  100,
    "startedAt": "conn-uuid-first",
    "endedAt":   "conn-uuid-last"
  }
}
```

**Column reference:**

| Column | Type | Description |
|--------|------|-------------|
| `connectionId` | string | `ApplicationConnection.id` — stable link between account and app |
| `accountId` | string | Account UUID |
| `neupId` | string \| null | Primary NeupID handle |
| `displayName` | string \| null | Account display name |
| `displayImage` | string \| null | Avatar URL |
| `accountType` | string | `individual`, `brand`, etc. |
| `isVerified` | boolean | Whether the account is verified |
| `accountCreatedAt` | ISO 8601 | When the account was created |
| `connectedAt` | ISO 8601 | When the account first connected to your app |
| `connectionStatus` | string | `active`, `inactive`, etc. |

---

### GET /bridge/api.v1/application/roles

Returns roles defined for your application, with permissions denormalized
inline on each role.

**Example request:**

```http
GET /account/bridge/api.v1/application/roles
  ?app=your-app-id
  &appSecret=your-app-secret
  &start=0
  &end=100
```

**Response (200):**

```json
{
  "success": true,
  "columns": [
    "roleId",
    "roleName",
    "roleDescription",
    "roleScope",
    "permissions"
  ],
  "data": [
    {
      "roleId":          "role-uuid",
      "roleName":        "editor",
      "roleDescription": "Can edit content",
      "roleScope":       null,
      "permissions": [
        {
          "rolePermissionId":     "rc-uuid",
          "permissionId":         "cap-uuid",
          "permissionName":       "content.edit",
          "permissionDescription":"Edit any content item",
          "permissionScope":      null,
          "denormalized":         null
        }
      ]
    }
  ],
  "meta": {
    "total":     12,
    "returned":  12,
    "startedAt": "role-uuid-first",
    "endedAt":   "role-uuid-last"
  }
}
```

**Column reference:**

| Column | Type | Description |
|--------|------|-------------|
| `roleId` | string | `AuthzRole.id` |
| `roleName` | string | Role name (unique per app) |
| `roleDescription` | string \| null | Human-readable description |
| `roleScope` | string \| null | Optional scope qualifier |
| `permissions` | array | Permissions assigned to this role |

**Permission object:**

| Field | Type | Description |
|-------|------|-------------|
| `rolePermissionId` | string | `AuthzRolePermission.id` — the join record |
| `permissionId` | string | `AuthzPermission.id` |
| `permissionName` | string | Permission name (e.g. `content.edit`) |
| `permissionDescription` | string \| null | Human-readable description |
| `permissionScope` | string \| null | Scope override on this role-permission link |
| `denormalized` | object \| null | Stored denormalized snapshot, if present |

---

### GET /bridge/api.v1/application/access

Returns access grants for your application — who has been granted what role
by whom — with the role's permissions denormalized inline.

**Example request:**

```http
GET /account/bridge/api.v1/application/access
  ?app=your-app-id
  &appSecret=your-app-secret
  &start=0
  &end=100
```

**Response (200):**

```json
{
  "success": true,
  "columns": [
    "grantId",
    "status",
    "ownerAccountId",
    "ownerDisplayName",
    "ownerAccountType",
    "targetAccountId",
    "targetDisplayName",
    "targetAccountType",
    "roleId",
    "roleName",
    "roleDescription",
    "roleScope",
    "permissions",
    "portfolioId"
  ],
  "data": [
    {
      "grantId":           "grant-uuid",
      "status":            "active",
      "ownerAccountId":    "owner-uuid",
      "ownerDisplayName":  "Acme Corp",
      "ownerAccountType":  "brand",
      "targetAccountId":   "target-uuid",
      "targetDisplayName": "Jane Smith",
      "targetAccountType": "individual",
      "roleId":            "role-uuid",
      "roleName":          "editor",
      "roleDescription":   "Can edit content",
      "roleScope":         null,
      "permissions": [
        {
          "permissionId":    "cap-uuid",
          "permissionName":  "content.edit",
          "permissionScope": null,
          "denormalized":    null
        }
      ],
      "portfolioId": null
    }
  ],
  "meta": {
    "total":     57,
    "returned":  57,
    "startedAt": "grant-uuid-first",
    "endedAt":   "grant-uuid-last"
  }
}
```

### POST /bridge/api.v1/application/access (filter by account)

Returns access grants **involving one specific account** (both directions):

- grants that were granted **to** the account (`targetAccountId = accountId`)
- grants that the account granted **to others** (`ownerAccountId = accountId`)

This endpoint does **not** accept `?account=` in the query string. Use the request body instead.

**Example request (all grants involving an account):**

```http
POST /account/bridge/api.v1/application/access
  ?app=your-app-id
  &appSecret=your-app-secret
content-type: application/json

{
  "accountId": "target-account-uuid"
}
```

**Example request (restrict to grants between two accounts, either direction):**

```http
POST /account/bridge/api.v1/application/access
  ?app=your-app-id
  &appSecret=your-app-secret
content-type: application/json

{
  "accountId": "target-account-uuid",
  "forAccount": "other-account-uuid"
}
```

**Column reference:**

| Column | Type | Description |
|--------|------|-------------|
| `grantId` | string | `AuthzAppAccessGrant.id` |
| `status` | string | `active`, `invited`, `on_hold`, `expired` |
| `ownerAccountId` | string | Account that issued the grant |
| `ownerDisplayName` | string \| null | Owner's display name |
| `ownerAccountType` | string | Owner's account type |
| `targetAccountId` | string | Account that received the grant |
| `targetDisplayName` | string \| null | Target's display name |
| `targetAccountType` | string | Target's account type |
| `roleId` | string | Role that was granted |
| `roleName` | string | Role name |
| `roleDescription` | string \| null | Role description |
| `roleScope` | string \| null | Role scope |
| `permissions` | array | Permissions on the granted role |
| `portfolioId` | string \| null | Portfolio this grant is scoped to, if any |

**Grant status values:**

| Status | Meaning |
|--------|---------|
| `active` | Grant is live |
| `invited` | Target has been invited but not yet accepted |
| `on_hold` | Grant is temporarily suspended |
| `expired` | Grant has expired |

---

## Quick reference

| Endpoint | Rows returned | Date filter | Cursor field |
|----------|---------------|-------------|--------------|
| `GET /bridge/api.v1/application/users` | `ApplicationConnection` rows | `connectedAt` | `connectionId` |
| `GET /bridge/api.v1/application/roles` | `AuthzRole` rows | — | `roleId` |
| `GET /bridge/api.v1/application/access` | `AuthzAppAccessGrant` rows | — | `grantId` |

All endpoints:
- Require `app` + `appSecret`
- Return at most 100 rows per call
- Support both offset (`start`/`end`) and cursor (`startFrom`/`limit`) pagination
- Include `columns`, `data`, and `meta` in every response
