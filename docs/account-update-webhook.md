# Account Update Webhook Integration Guide

This guide explains how a target application can receive and process `account.updated` events from `neup.account`.

## 1. What this event is

When a connected account profile changes, `neup.account` sends a webhook event to subscribed apps.

Event source:
- `sourceAppId: "neup.account"`
- `eventType: "account.updated"`

Changed fields that may be included in `changedFields`:
- `neupId`
- `displayName`
- `displayImage`
- `gender`
- `dateOfBirth`
- `role`
- `isMinor`
- `accountType`

## 2. Webhook registration

Your app must provide a webhook URL in bridge config with:
- `type = "accountUpdateWebhook"`
- `value = "https://your-domain.com/your-webhook-endpoint"`

Only HTTPS URLs should be used.

## 3. Security model

Each webhook message is:
- encrypted using your app's `appSecret`
- signed using your app's `appSecret`

Algorithms:
- encryption: `AES-256-GCM`
- signature: `HMAC-SHA256`

## 4. Incoming request format

Headers:
- `x-bridge-encryption: aes-256-gcm`
- `x-bridge-signature-alg: hmac-sha256`
- `x-bridge-signature: <hex-signature>`

Body:
```json
{
  "eventType": "account.updated",
  "encrypted": true,
  "iv": "base64",
  "tag": "base64",
  "data": "base64"
}
```

## 5. Receiver workflow

1. Read raw body JSON.
2. Validate required fields: `eventType`, `encrypted`, `iv`, `tag`, `data`.
3. Recompute signature using your `appSecret`:
   - signing input: `iv + "." + tag + "." + data`
   - expected signature: `HMAC_SHA256(signing_input, appSecret)` in hex
4. Compare with `x-bridge-signature` using constant-time comparison.
5. If signature is valid, decrypt:
   - key = `SHA256(appSecret)` (32 bytes)
   - iv = base64 decode `iv`
   - auth tag = base64 decode `tag`
   - ciphertext = base64 decode `data`
   - algorithm: `AES-256-GCM`
6. Parse decrypted plaintext JSON.
7. Persist the event in your system.
8. Return acknowledgment.

## 6. Acknowledgment contract

Return exactly one of:

Success:
```json
{ "success": true }
```

Failure:
```json
{ "success": false, "error": "errorCode", "reason": "optional detail" }
```

You can include extra fields on failure. They are captured by sender-side development logs when applicable.

## 7. Decrypted payload shape

```json
{
  "eventId": "uuid",
  "eventType": "account.updated",
  "sourceAppId": "neup.account",
  "occurredAt": "2026-05-28T12:34:56.789Z",
  "appId": "target-app-id",
  "connectionId": "connection-id",
  "changedFields": ["displayName", "displayImage"],
  "account": {
    "neupId": "np_...",
    "displayName": "New Name",
    "displayImage": "https://...",
    "gender": "male",
    "dateOfBirth": "2000-01-31",
    "role": "role.id",
    "isMinor": false,
    "accountType": "individual"
  }
}
```

## 8. Node.js example (verify + decrypt)

```ts
import { createHash, createHmac, createDecipheriv, timingSafeEqual } from 'crypto';

function sha256(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

function verifySignature(params: {
  iv: string;
  tag: string;
  data: string;
  receivedSignature: string;
  appSecret: string;
}): boolean {
  const signingInput = `${params.iv}.${params.tag}.${params.data}`;
  const expected = createHmac('sha256', params.appSecret).update(signingInput, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(params.receivedSignature || '', 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function decryptEnvelope(params: {
  iv: string;
  tag: string;
  data: string;
  appSecret: string;
}): string {
  const key = sha256(params.appSecret);
  const iv = Buffer.from(params.iv, 'base64');
  const tag = Buffer.from(params.tag, 'base64');
  const ciphertext = Buffer.from(params.data, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
```

## 9. Minimal HTTP handler behavior

- If signature check fails: return `{ "success": false, "error": "invalid_signature" }`
- If decryption fails: return `{ "success": false, "error": "decrypt_failed" }`
- If persistence fails: return `{ "success": false, "error": "record_failed" }`
- If successful: return `{ "success": true }`

## 10. Notes

- Keep your `appSecret` server-side only.
- Rotate webhook URLs and secrets using your operational process.
- Use idempotency with `eventId` to avoid duplicate processing.
