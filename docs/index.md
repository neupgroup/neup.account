# Docs Index

## Authentication

- `docs/authentication.md` — public guide to authenticate other applications (party 1–4, POST vs redirect vs same/different domain).
- `docs/auth/1.1_internal_flow_samedomain.md` — internal apps on the same domain (cookie session).
- `docs/auth/1.2_internal_flow_differentdomain.md` — trusted internal/partner apps on a different domain (server‑to‑server verify).
- `docs/auth/1.3_external_flow.md` — third‑party apps (redirect handshake + grant exchange).
- `docs/silent-auth-token-flow.md` — Silent SSO iframe → `postMessage` token flow.
- `docs/auth/silent-sso-integration-guide.md` — quick Silent SSO integration steps.
- `docs/external-app-api.md` — external app server APIs (users/roles/access).
- `docs/profile.md` — external app APIs for accessible accounts (accounts/brands/dependents).
- `docs/application.md` — external app application APIs (users/roles/access index).
- `docs/auth.md` — auth endpoint reference (what to call when).
- `docs/account-update-webhook.md` — account update webhook integration (verify signature, decrypt payload, return `{ success: true|false }`).
- `docs/account-access-client-guide.md` — recommended client-side storage model for persisting account/app access from webhook payloads.
- `docs/role-update-webhook.md` — role update webhook integration (event mapping, payload schema, verify signature, decrypt payload).
