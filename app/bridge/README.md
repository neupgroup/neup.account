# Bridge

HTTP integration surface for authentication, profile lookup, application access, and webhook delivery.

## Shared Rules

- Query parameters use `app`, not `appId`, on bridge routes that identify an application.
- `silent.v1` routes return HTML + `postMessage`, not JSON.
- Route handlers stay thin and delegate to `services/` or `core/auth/`.

## Documentation

- [API v1 Overview](api.v1/README.md)
- [Auth Endpoints](api.v1/auth/README.md)
- [Application Endpoints](api.v1/application/README.md)
- [Silent SSO](silent.v1/README.md)
- [`silent.v1` Route Rules](silent.v1/rules.md)

::neup.documentation::bridge-folder
::title Bridge Folder Documentation

Shared routing surface for external integrations and first-party bridge flows.

::public

The bridge exposes the documented integration routes used by browser redirects, server-to-server auth calls, silent SSO, profile lookup, and application access exports.

::public end

::private

Most bridge handlers are request parsers plus response shaping. Business logic belongs in `services/auth`, `services/applications`, `services/bridge`, and `core/auth`.

::private end

::end
