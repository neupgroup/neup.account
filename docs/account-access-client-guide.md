# Account Access Client Storage Guide

This guide describes the recommended storage model for independent client
applications that consume `account.updated` and `role.updated` webhooks from
Neup.Account.

The goal is to keep the client integration simple while still preserving the
full current role and permission state needed for access checks.

## Recommendation

For most client applications, use:

- one `account` table for account/app level identity and profile fields
- one `access` table to map an account to one or more roles
- one `role` table for the full current role state

This is the recommended default.

You do **not** need to mirror Neup.Account's full internal auth schema unless
you need deeper relational reporting across permissions.

## Recommended Tables

```sql
create table account (
  account_id text not null,
  app_id text not null,
  connection_id text,
  display_name text,
  display_image text,
  updated_at timestamptz not null default now(),
  primary key (account_id, app_id)
);

create table role (
  app_id text not null,
  role_id text not null,
  role_name text not null,
  role_description text,
  scope text,
  acquisition_type text,
  approval_policy text,
  applicable_for jsonb not null default '[]'::jsonb,
  permissions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (app_id, role_id)
);

create table access (
  account_id text not null,
  app_id text not null,
  role_id text not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, app_id, role_id)
);
```

## Field Meaning

`account`

- `account_id`: Neup account id from webhook payload.
- `app_id`: receiving application id from webhook payload.
- `connection_id`: Neup connection id for this account/app pair.
- `display_name`: latest known display name, when provided.
- `display_image`: latest known display image URL, when provided.
- `updated_at`: last processed update time in the client system.

`role`

- `app_id`: receiving application id from webhook payload.
- `role_id`: role id from `account.roles[].id`.
- `role_name`: role name from `account.roles[].name`.
- `role_description`: role description from `account.roles[].description`.
- `scope`: role scope.
- `acquisition_type`: role acquisition type.
- `approval_policy`: role approval policy.
- `applicable_for`: JSON array from `account.roles[].applicableFor`.
- `permissions`: JSON array from `account.roles[].permissions`.
- `updated_at`: last processed update time in the client system.

`access`

- `account_id`: Neup account id from webhook payload.
- `app_id`: receiving application id from webhook payload.
- `role_id`: role id assigned to that account for that app.
- `updated_at`: last processed update time in the client system.

## Stored Role Shape

Each row in `role` should represent one current role definition for the app.

Each row in `access` should represent one current role assigned to the account
for that app.

Example `role` row:

```json
{
  "app_id": "NeupEstate.660724c77",
  "role_id": "NeupEstate.660724c77.application.owner",
  "role_name": "Application Owner",
  "role_description": "Full control over the application",
  "scope": "global",
  "acquisition_type": "direct",
  "approval_policy": "auto",
  "applicable_for": ["individual", "brand"],
  "permissions": [
    "manage.faq.create",
    "manage.faq.delete",
    "manage.faq.update"
  ]
}
```

Example `access` row:

```json
{
  "account_id": "412c705d-b45a-4ec9-a26f-6afd55469526",
  "app_id": "NeupEstate.660724c77",
  "role_id": "NeupEstate.660724c77.application.owner"
}
```

## Webhook Handling

### `account.updated`

Use `account.updated` as the main source of account access state.

Upsert one row in `account` by `(account_id, app_id)`.

Rules:

- Always store `account.id` as `account_id`.
- Always store `appId` as `app_id`.
- Store `connectionId` when present.
- Store `profile.displayName` into `display_name` when present.
- Store `profile.displayImage` into `display_image` when present.
- If `account.roles` is present, replace all rows in `access` for `(account_id, app_id)`.
- If `account.roles` is present, upsert all incoming roles into `role` by `(app_id, role_id)`.
- If `account.roles` is present, insert one `access` row per assigned role.
- Update `updated_at` after successful processing.

Important:

- When `changedFields` includes `role`, the `account.roles` array is the full
  replacement state for that account in that app.
- Do not merge role rows incrementally.
- Do not keep removed roles if they are absent from the payload.

### `role.updated`

`role.updated` is optional for clients using the `account` + `access` + `role`
model.

If the client only needs to know:

- who the account is
- what roles they currently have
- what permissions those roles currently contain

then `account.updated` is enough.

Use `role.updated` only if the client also wants to maintain a separate role
catalog independent from account access rows.

## Example `account.updated` Payload

```json
{
  "success": true,
  "eventId": "a73c331d-68b7-47a4-95d7-029c0ccb21b2",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-06-24T10:12:15.698Z",
  "changedFields": ["role"],
  "appId": "NeupEstate.660724c77",
  "connectionId": "9dc11db8-42fd-4efe-8e18-bd626bec18c4",
  "account": {
    "id": "412c705d-b45a-4ec9-a26f-6afd55469526",
    "roles": [
      {
        "id": "NeupEstate.660724c77.application.owner",
        "name": "Application Owner",
        "description": "Full control over the application",
        "scope": "global",
        "acquisitionType": "direct",
        "approvalPolicy": "auto",
        "applicableFor": ["individual", "brand"],
        "permissions": [
          "manage.faq.create",
          "manage.faq.delete",
          "manage.faq.update"
        ]
      }
    ]
  }
}
```

## Suggested Upsert Flow

1. Verify and decrypt the webhook payload.
2. Read `appId` and `account.id`.
3. Upsert the row keyed by `(account_id, app_id)` in `account`.
4. Update scalar fields only when present in the payload.
5. If `account.roles` is present, delete existing `access` rows for that
   `(account_id, app_id)`.
6. Upsert each payload role into `role` keyed by `(app_id, role_id)`.
7. Insert one `access` row for each incoming role.
8. Mark `updated_at` with the processing time.

## When To Use A More Normalized Schema

The three-table model above is recommended by default.

Move to a more normalized schema only if the client needs:

- SQL queries by permission name
- reporting by role or permission
- joins across accounts, roles, and permissions
- permission-based filtering without reading JSON arrays

If those requirements appear later, the client can split
`role.permissions` into a fourth flattened join table such as
`role_permission`.
