/*
::neup.documentation::logica-basics-folder
::title Logica Basics Snapshot Documentation

Documentation index for generated baseline authz and app metadata snapshots.

::public

Use the files in this folder as generated read-only snapshots for application identity, permission catalog, and bundled role definitions.

::public end

::private

These files are exported artifacts. Regenerate them from the source authz/application data instead of editing them manually.

::private end

::end
*/

/*
::neup.documentation::logica-basics-appinfo-json
::title App Info Snapshot

Documents `appinfo.json`, the generated application identity snapshot for the account app.

::public

`appinfo.json` contains the stable application identifier, display name, and optional description used by downstream consumers that need a minimal app descriptor.

::public end

::private

The file shape is intentionally small so exporters and bridge consumers can rely on a compact, version-stable contract.

::private end

::end
*/

/*
::neup.documentation::logica-basics-permissions-json
::title Permission Catalog Snapshot

Documents `permissions.json`, the generated permission catalog snapshot for this app.

::public

`permissions.json` lists the full permission records consumed by scanners, role assembly, and external logic consumers that need the authoritative catalog.

::public end

::private

Each record can include usage metadata gathered from routes and services, so this snapshot is broader than the minimal permission declarations embedded in source files.

::private end

::end
*/

/*
::neup.documentation::logica-basics-roles-json
::title Role Catalog Snapshot

Documents `roles.json`, the generated role-definition snapshot for this app.

::public

`roles.json` exposes bundled roles, their scope policy, acquisition mode, and attached permission IDs for downstream authz consumers.

::public end

::private

This snapshot is generated from persisted authz role data and should stay aligned with the permission snapshot in the same folder.

::private end

::end
*/
