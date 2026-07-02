# Prisma

Schema, generated client, migrations, and seed support for the Neup Account data model.

::neup.documentation::prisma-folder
::title Prisma Folder Documentation

Entry point for Prisma-specific schema and migration documentation.

::public

Use this folder for the database schema, generated Prisma client output, migrations, and seed helpers.

::public end

::private

The schema is the canonical description of the persisted account, access, application, and authn/authz tables used by this app.

::private end

::end

::neup.documentation::prisma-schema-prisma
::title Prisma Schema

Documents `schema.prisma`, the Prisma schema that defines the application's database models and relations.

::public

`schema.prisma` defines the account graph, requests, notifications, profile records, access model, authn/authz tables, and supporting resources used by the app.

::public end

::private

The schema captures both the newer denormalized access model and several legacy compatibility tables that are still referenced by manage and bridge services during the migration window.

::private end

::end
