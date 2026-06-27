# Application Services

Chapter index for application-management and webhook implementation.

## Source Documents

- [`authz-manage.ts`](authz-manage.ts)
- [`permission-definitions.ts`](permission-definitions.ts)
- [`manage.ts`](manage.ts)
- [`access.ts`](access.ts)
- [`account-update-events.ts`](account-update-events.ts)
- [`role-update-events.ts`](role-update-events.ts)
- [`authz-webhook.ts`](authz-webhook.ts)

## Shared Rules

- Keep folder-level ownership notes here.
- Keep webhook payload contracts in the dispatcher source files.
- Keep role and permission behavior in the source file that enforces it.

::neup.documentation::services-applications-folder
::title Application Services Folder Documentation

Shared entry point for application-management services.

::public

Use this README as the chapter index. The live documentation should sit in the source files linked above.

::public end

::private

This folder should not accumulate duplicate prose. If a payload or rule changes, update the owning `.ts` file and let the compiler rebuild the generated documentation.

::private end

::end
