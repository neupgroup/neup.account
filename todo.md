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

## Documentation Follow-Ups

- [ ] Add `::neup.documentation::...` blocks for `logica/core/approle.mjs`.
- [ ] Add `::neup.documentation::...` blocks for `logica/basics/appinfo.json`.
- [ ] Add `::neup.documentation::...` blocks for `logica/accounts/permissions.json`.
- [ ] Add `::neup.documentation::...` blocks for `logica/accounts/roles.json`.
- [ ] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/application-management-panel.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `app/(manage)/application/users/_components/users-list.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `components/ui/flow-link.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `proxy.ts`.
- [ ] Add `::neup.documentation::...` blocks for `services/applications/manage.ts`.
- [x] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/role-create-form.tsx`.
- [x] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/role-detail-editor.tsx`.
- [x] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/permission-detail-editor.tsx`.
- [x] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/permission-panel.tsx`.
- [x] Add `::neup.documentation::...` blocks for `app/(manage)/application/_components/roles-panel.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `services/applications/authz-config.ts`.
- [ ] Add `::neup.documentation::...` blocks for `services/applications/role-scope-compatibility.ts`.
- [ ] Add `::neup.documentation::...` blocks for `services/applications/permission-scopes.ts`.
- [ ] Add `::neup.documentation::...` blocks for `app/(manage)/access/_components/actions.ts`.
- [ ] Add `::neup.documentation::...` blocks for `services/access-model.ts`.
- [ ] Add `::neup.documentation::...` blocks for `app/(manage)/application/roles/page.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `app/(manage)/access/_components/asset-member-lookup-form.tsx`.
- [ ] Add `::neup.documentation::...` blocks for `services/manage/access/index.ts`.

## Migration Follow-Ups

- [ ] Fix `20260629120000_rename_branch_to_subbrand` so it tolerates databases without legacy tables like `account_ownership`.
