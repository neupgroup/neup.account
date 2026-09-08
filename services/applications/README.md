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

### Shared permission definitions

Applications can choose **Use permission from other app** on their Configuration or Permissions page.
Configuration keeps this setting accessible when the shared-permission application's role and
permission management links are hidden. Select the local-permissions option to stop sharing.
`application.usePermissionFrom` references `application.id`; null means local definitions.
The picker lists applications whose permissions the current account can manage. Selecting a
source also requires permission-management access to the consuming application. The source
must define its own permissions. Applications currently serving as a source cannot switch
until their consumers disconnect. Deleting a referenced source is blocked by the foreign key.

Roles and account grants remain application-specific. Source switches remap existing roles
by permission name in a serializable transaction; missing definitions or incompatible scopes
reject the entire change. Local definitions are preserved for switching back. Consumers can
read shared definitions and assign them to their own roles, but must edit definitions in the
source application. The bridge permission and role sync endpoints follow the same source.

`application.developer` references `account.id`. New applications store the selected owner
account; existing applications retain null until a developer is assigned. There is no separate
developer table.

Apply `prisma/migrations/20260909120000_application_permission_source/migration.sql` through
the normal Prisma migration deployment before running the updated application. Regenerate
the Prisma client when deploying (`npx prisma generate`).
