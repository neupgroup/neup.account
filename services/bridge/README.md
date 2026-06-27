# Bridge Services

Chapter index for bridge-facing service logic.

## Source Documents

- [`application-users.ts`](application-users.ts)
- [`application-roles.ts`](application-roles.ts)
- [`application-access.ts`](application-access.ts)
- [`application-team.ts`](application-team.ts)
- [`roles-assign-me.ts`](roles-assign-me.ts)
- [`dev-logs.ts`](dev-logs.ts)

## Shared Rules

- Keep HTTP request/response contracts in route files under `app/bridge/**`.
- Keep pagination, export shaping, filtering, and bridge-side support behavior in these service files.

::neup.documentation::services-bridge-folder
::title Bridge Services Folder Documentation

Shared entry point for bridge service documentation.

::public

Use this README as the chapter index. The source files linked above own the live behavior documentation.

::public end

::private

This folder should document service semantics such as filtering, export shaping, and dev-log behavior, not duplicate the route-level HTTP prose.

::private end

::end
