# Role Update Webhook Integration Guide

This guide explains how to receive and process encrypted role update events from `neup.account`.

## 1. Event overview

Role webhook events are sent from:
- `sourceAppId: "neup.account"`

Event type mapping:
- role create -> `role.updated`
- role permission update -> `role.updated`
- role delete/remove -> `role.deleted`

## 2. Webhook registration

In app configuration, set:
- Bridge type: `roleUpdateWebhook`
- Value: your public HTTPS endpoint

Example:
- `https://your-domain.com/webhooks/role-update`

If unset, role events are not dispatched.

## 3. Security model

Every request is:
- encrypted with your app's `appSecret` (`AES-256-GCM`)
- signed with your app's `appSecret` (`HMAC-SHA256`)

Headers:
- `x-bridge-encryption: aes-256-gcm`
- `x-bridge-signature-alg: hmac-sha256`
- `x-bridge-signature: <hex_hmac>`

Body:
```json
{
  "eventType": "role.updated",
  "encrypted": true,
  "iv": "base64",
  "tag": "base64",
  "data": "base64"
}
```

## 4. Decrypted payload contract

```json
{
  "eventId": "evt_123",
  "eventType": "role.updated | role.deleted",
  "appId": "neup.estate",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:00:00.000Z",
  "role": {
    "id": "role_uuid",
    "name": "Admin",
    "description": "Can manage everything",
    "scope": "global",
    "permissions": ["permission1", "permission2", "permission3"]
  }
}
```

## 5. Receiver checklist

1. Parse JSON envelope.
2. Verify required fields: `iv`, `tag`, `data`, `eventType`.
3. Verify signature using your `appSecret`:
   - signing input: `iv + "." + tag + "." + data`
   - expected: `HMAC_SHA256(signing_input, appSecret)` hex
4. Decrypt with `AES-256-GCM`:
   - key: `SHA256(appSecret)`
   - iv/tag/data: base64-decoded
5. Parse decrypted payload.
6. Apply role update/delete in your system.
7. Return acknowledgment.

## 6. Acknowledgment response

Success:
```json
{ "success": true }
```

Failure (can include extra fields):
```json
{ "success": false, "error": "error_code", "reason": "optional details" }
```

## 7. Node.js verify + decrypt example

```ts
import { createHash, createHmac, createDecipheriv, timingSafeEqual } from 'crypto';

function sha256(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

function verifySignature(iv: string, tag: string, data: string, receivedSignature: string, appSecret: string): boolean {
  const signingInput = `${iv}.${tag}.${data}`;
  const expected = createHmac('sha256', appSecret).update(signingInput, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(receivedSignature || '', 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function decryptEnvelope(ivB64: string, tagB64: string, dataB64: string, appSecret: string): string {
  const key = sha256(appSecret);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
```

## 8. Recommended behavior

- Treat `eventId` as idempotency key.
- Reject invalid signature/decrypt attempts with `{ "success": false }`.
- Keep `appSecret` server-side only.
