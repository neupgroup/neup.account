# Application API

Chapter index for application-scoped export endpoints.

## Source Documents

- [`/bridge/api.v1/application/users`](users/route.ts)
- [`/bridge/api.v1/application/roles`](roles/route.ts)
- [`/bridge/api.v1/application/access`](access/route.ts)
- [`services/bridge/application-users.ts`](../../../services/bridge/application-users.ts)
- [`services/bridge/application-roles.ts`](../../../services/bridge/application-roles.ts)
- [`services/bridge/application-access.ts`](../../../services/bridge/application-access.ts)

## Shared Rules

- Keep cross-endpoint rules here.
- Keep each endpoint contract in its own route file.
- Keep pagination and shaping behavior docs in the service file when that behavior is owned there.

::neup.documentation::bridge-application-folder
::title Bridge Application Folder Documentation

Shared entry point for application export routes.

::public

Use this README as the chapter index. The detailed contracts live in the linked route and service files.

::public end

::private

The decentralized rule here is strict: route files document HTTP contracts, service files document query/filter/pagination semantics, and this README only links them.

::private end

::end
