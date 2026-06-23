# Account Update Webhook Payload Guide

This guide documents the public payload contract for `account.updated` events.

## Event

- `eventType`: `account.updated`
- Meaning: one or more account-related values changed.

## Payload Shape

```json
{
  "success": true,
  "eventId": "evt_01J...",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:34:56.789Z",
  "appId": "target-app-id",
  "connectionId": "connection-id",
  "changedFields": ["displayName"],
  "account": {
    "id": "f18af8c5-5099-4234-8f78-10cf52f08038"
  },
  "profile": {
    "displayName": "Kishor Neupane"
  }
}
```

## Field Meanings

- `success`: always `true` for a valid event payload.
- `eventId`: unique ID of this event. Use for idempotency.
- `eventType`: always `account.updated` in this guide.
- `sourceAppId`: source system identifier.
- `occurredAt`: ISO-8601 timestamp when event was produced.
- `appId`: receiving app identifier context.
- `connectionId`: connection context for the receiving app.
- `changedFields`: list of logical fields that changed.
- `account`: always present; always includes `id`.
- `profile`: present only if one or more profile fields changed.
- `account.roles`: present only if role changed for this app connection, and contains the full current role state for that app.
- `access`: present only if access changes are included for this event type in future/active integrations.

## Presence Rules (What Will Be There / Not There)

- `account` is always present.
- `account.id` is always present.
- Unchanged sections are omitted, not sent as `null`.
- Unchanged keys inside a sent section are omitted.
- `changedFields` reflects only changed logical fields.
- When `changedFields` includes `role`, `account.roles` is sent as the full replacement set for that app context. Consumers should replace prior role state with this array.

## Supported `changedFields`

- `neupId`
- `displayName`
- `displayImage`
- `gender`
- `dateOfBirth`
- `role`
- `access`
- `isMinor`
- `accountType`

## Detailed Examples

### 1) Only display name changed

```json
{
  "success": true,
  "eventId": "evt_1001",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:34:56.789Z",
  "appId": "my.app",
  "connectionId": "conn_1",
  "changedFields": ["displayName"],
  "account": {
    "id": "f18af8c5-5099-4234-8f78-10cf52f08038"
  },
  "profile": {
    "displayName": "Changed Name"
  }
}
```

Not included:
- `profile.displayImage`
- `profile.gender`
- `role`
- other unchanged account fields

### 2) Only account type changed

```json
{
  "success": true,
  "eventId": "evt_1002",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:40:00.000Z",
  "appId": "my.app",
  "connectionId": "conn_1",
  "changedFields": ["accountType"],
  "account": {
    "id": "f18af8c5-5099-4234-8f78-10cf52f08038",
    "accountType": "individual"
  }
}
```

Not included:
- `profile`
- `role`
- unrelated account keys

### 3) Role changed

```json
{
  "success": true,
  "eventId": "evt_1003",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:45:00.000Z",
  "appId": "my.app",
  "connectionId": "conn_1",
  "changedFields": ["role"],
  "account": {
    "id": "f18af8c5-5099-4234-8f78-10cf52f08038",
    "roles": [
      {
        "id": "0f299f90-dc73-4f87-a800-8bdb61c806cc",
        "name": "root.full",
        "description": "Full application access",
        "scope": "global",
        "acquisitionType": "direct",
        "approvalPolicy": "auto",
        "applicableFor": ["individual", "brand"],
        "permissions": [
          "my.app.manage-listing-create",
          "my.app.manage-listing-update",
          "my.app.manage-listing-delete"
        ]
      }
    ]
  }
}
```

Not included:
- `profile`
- other account keys unless they changed in same event
- a top-level `role` key

### 4) Multiple fields changed together

```json
{
  "success": true,
  "eventId": "evt_1004",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:50:00.000Z",
  "appId": "my.app",
  "connectionId": "conn_1",
  "changedFields": ["displayName", "displayImage", "isMinor"],
  "account": {
    "id": "f18af8c5-5099-4234-8f78-10cf52f08038",
    "isMinor": false
  },
  "profile": {
    "displayName": "Kishor Neupane",
    "displayImage": "https://cdn.neupgroup.com/neupaccount/assets/displayImage/strategist_male.jpg"
  }
}
```

## Consumer Recommendations

- Use `eventId` for idempotency.
- Update only the keys present in payload.
- Do not clear fields just because they are absent.
- When `account.roles` is present, treat it as the full current state for that app and replace your stored roles for that account/app pair.
