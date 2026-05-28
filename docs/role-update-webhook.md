# Role Update Webhook Payload Guide

This guide documents the public payload contract for role events.

## Events

- `role.updated`: role data should be created or updated.
- `role.deleted`: role should be deleted on the receiver side.

## Common Payload Fields

```json
{
  "success": true,
  "eventId": "evt_02A...",
  "eventType": "role.updated",
  "appId": "target-app-id",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:00:00.000Z",
  "role": {
    "id": "role_uuid",
    "name": "root.full"
  }
}
```

Field meanings:
- `success`: always `true` for a valid payload.
- `eventId`: unique event identifier.
- `eventType`: `role.updated` or `role.deleted`.
- `appId`: app identifier context.
- `sourceAppId`: source system identifier.
- `occurredAt`: ISO-8601 event timestamp.
- `role`: role object; exact keys depend on event type.

## Event-Specific Role Shape

### `role.updated`

For updates, the full role shape is sent, including `permissions`.

```json
{
  "success": true,
  "eventId": "evt_role_2001",
  "eventType": "role.updated",
  "appId": "my.app",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T13:00:00.000Z",
  "role": {
    "id": "0f299f90-dc73-4f87-a800-8bdb61c806cc",
    "name": "root.full",
    "description": "description for the role string",
    "scope": "global",
    "permissions": [
      "permission_string_1",
      "permission_string_2",
      "permission_string_3"
    ]
  }
}
```

What this means:
- Replace/sync your role data using all provided role fields.
- `permissions` is authoritative for this role at this event time.

### `role.deleted`

For deletes, only role identity is sent.

```json
{
  "success": true,
  "eventId": "evt_role_2002",
  "eventType": "role.deleted",
  "appId": "my.app",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T13:10:00.000Z",
  "role": {
    "id": "0f299f90-dc73-4f87-a800-8bdb61c806cc",
    "name": "root.full"
  }
}
```

What will not be included for `role.deleted`:
- `role.description`
- `role.scope`
- `role.permissions`

## Presence Rules

- `role` is always present for role events.
- `role.id` and `role.name` are always present.
- `permissions` is present only for `role.updated`.
- Missing keys mean "not included for this event type", not necessarily null/empty.

## Consumer Recommendations

- Use `eventId` for idempotency.
- For `role.updated`, upsert role and sync permissions from payload.
- For `role.deleted`, delete by `role.id`.
