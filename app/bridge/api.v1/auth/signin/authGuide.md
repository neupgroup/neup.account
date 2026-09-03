# Bridge Sign-in Guide
baseendpoint: https://neupgroup.com/account

Endpoint:

```text
https://neupgroup.com/account/bridge/api.v1/auth/signin
```

## 1. Create an authentication request

```http
GET https://neupgroup.com/account/bridge/api.v1/auth/signin
```

Example response:

```json
{
  "id": "auth-request-uuid",
  "actBefore": "2026-09-03T12:30:00.000Z",
  "expiresOn": "2026-09-03T12:30:00.000Z",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."
}
```

Keep the returned `jwt`. It is used for all following requests.

## 2. Submit the NeupID

```http
POST https://neupgroup.com/account/bridge/api.v1/auth/signin
Authorization: Bearer YOUR_JWT
Content-Type: application/json
```

```json
{
  "neupid": "kishor",
}
```

Successful response:

```json
{
  "neupid": "kishor",
  "continue": "password",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."

}
```

Invalid response:

```json
{
  "neupid": "kishor",
  "error": "neupid.notexists or the code defined in the auth system, same code"
}
```


The NeupID is saved on the authentication request in the database.

## 3. Submit the password

Use the same JWT. The NeupID does not need to be sent again.

```http
POST https://neupgroup.com/account/bridge/api.v1/auth/signin
Authorization: Bearer YOUR_NEWLY_RECEIVED_JWT
Content-Type: application/json
```

```json
{
  "password": "your-password"
}
```

Successful response/s:
There can be multiple form of successful formats.

```json
{
  "continue": "mfaToken",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."  
}
```

```json
{
  "continue": "totpToken",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."  
}
```

```json
{
  "continue": "saveToken",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."
}
```

```json
{
  "continue": "termsApproval",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."
}
```

```json
{
  "continue": "chooseOtpMethod",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."
}
```

```json
{
  "continue": "verifyOtpMethod",
  "jwt": "eyJhbGciOiJIUzI1NiIs..."
} -> things like showing the last 2 digits of the number and asking for the full digit of the phone.
```


The request is moved to the terms-approval step after successful password verification.

## 4. Approve terms

After the password is accepted, the endpoint returns `continue: "termsApproval"`.
Submit the terms and approval using the same JWT:

```json
{
  "terms": {
    "Privacy Policy": "https://example.com/privacy",
    "Terms of Usage": "https://example.com/terms",
    "approved": true
  }
}
```

The final response is:

```json
{
  "success": true,
  "continue": "saveTotp",
  "auth_account": "..."
}
```

## JWT expiration

The JWT contains `id`, `actBefore`, `expiresOn`, and `iat`. The `expiresOn` value controls expiration; no `exp` claim is included.

Authentication requests are single-use and expire after the configured timeout. A completed or expired request cannot be reused.

## Alternative JWT header

Instead of `Authorization`, clients may send:

```http
x-auth-request: YOUR_JWT
```

## Common errors

```json
{ "success": false, "error": "Auth request JWT is required." }
```

```json
{ "success": false, "error": "Invalid or expired auth request." }
```

```json
{ "success": false, "error": "Invalid credentials." }
```
