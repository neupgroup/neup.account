# Access Model Migration Todo

- [x] Treat `access.guide.md` as the source of truth for access, asset, and member relationships.
- [x] Update Prisma schema so `member`, `assets`, and `access` match the guide fields.
- [x] Add a migration that moves the current asset-shaped `access` table back to `assets` and creates the new denormalized `access` table.
- [x] Add service helpers for member, asset, access-grant creation, expiry cleanup, and role permission lookup.
- [x] Update application access services to read/write through `access` and resolve permissions from `AuthzRole.permissions`.
- [x] Update direct account access services to use `member` plus `access`, not legacy `Role` grant rows.
- [x] Update portfolio asset access services to use `access`, not `authzAssetsAccessGrant`.
- [x] Update bridge/API service responses so apps receive consistent access, asset, and permission data from the new model.
- [x] Run Prisma generation and a type-oriented check if available, without running a build.


## Migration Follow-Ups

- [ ] Fix `20260629120000_rename_branch_to_subbrand` so it tolerates databases without legacy tables like `account_ownership`.
- [ ] Repair stale role snapshot rows in `logica/basics/roles.json` that still reference missing permissions, such as `neup_account.brand_owner` using `brand.*` permissions that are not present in the canonical permission catalog.
- [ ] Add documentation blocks or module-level documentation for the undocumented Prisma authz/access entities in `prisma/schema.prisma`, especially the legacy `role` snapshot table and its relationship to `authz_role`, `member`, and `access`.
- [ ] Upgrade auth/profile bridge documentation blocks for `core/auth/verify.ts`, `core/auth/cookies.ts`, and `app/bridge/api.v1/profile/route.ts` so they follow `documentation.guide.md` instead of relying on plain comments.
- [ ] Upgrade auth-session helper documentation for `core/auth/accountToken.ts`, `core/auth/check.ts`, and `core/auth/guard.ts` so they use `::neup.documentation::...` blocks instead of plain comments.
- [ ] Fix `prisma/grant-root.ts` so it uses the current `authz_role` schema and looks up NeupID records by `neupId`, not stale role fields.
- [ ] Document `package.json` authz maintenance commands so `sync:permissions:neup-account` / `rebuild:authz:neup-account` clearly describe when they rebuild database catalog tables versus when they only export snapshots.
- [ ] Document `logica/basics/roles.json` and `logica/basics/permissions.json` as generated authz snapshots, including which script owns them and how they are used as database rebuild inputs.
