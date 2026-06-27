# Silent SSO

Chapter index for the `silent.v1` bridge surface.

## Source Documents

- [Route rules](rules.md)
- [`GET /bridge/silent.v1/whoisthis`](whoisthis/route.ts)
- [`POST /bridge/silent.v1/auth/exchange`](auth/exchange/route.ts)
- [`services/auth/silent-sso.ts`](../../services/auth/silent-sso.ts)

## Shared Rules

- Keep folder-level guidance here.
- Keep endpoint contracts inside the owning `route.ts` file.
- Keep token/origin/identity behavior inside the owning service file.

::neup.documentation::bridge-silent-sso-folder
::title Silent SSO Folder Documentation

Shared entry point for the `silent.v1` chapter.

::public

Use this README as the index. The endpoint contracts live in the source files linked above.

::public end

::private

This folder should stay decentralized: route files carry route documentation, and `services/auth/silent-sso.ts` carries the underlying auth implementation documentation.

::private end

::end
