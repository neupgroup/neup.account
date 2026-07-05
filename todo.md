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
- [ ] Add Neup documentation blocks for `app/bridge/api.v1/accounts/lookup/route.ts` and `app/bridge/api.v1/connection/sign&get/route.ts`, which currently expose bridge contracts with little or no structured route documentation.
- [ ] Add Neup documentation blocks for `app/bridge/handshake.v1/auth/grant/route.ts` and `app/bridge/api.v1/auth/whoisthis/route.ts`, which still rely on plain comments for important public auth contracts.
- [ ] Add Neup documentation blocks for `app/bridge/api.v1/roles/assign.me/route.ts` and `app/bridge/resource.v1/sdk/route.ts`, which currently expose public bridge resources without structured route documentation.
- [ ] Fix `prisma/grant-root.ts` so it uses the current `authz_role` schema and looks up NeupID records by `neupId`, not stale role fields.
- [ ] Document `package.json` authz maintenance commands so `sync:permissions:neup-account` / `rebuild:authz:neup-account` clearly describe when they rebuild database catalog tables versus when they only export snapshots.
- [ ] Document `logica/basics/roles.json` and `logica/basics/permissions.json` as generated authz snapshots, including which script owns them and how they are used as database rebuild inputs.
- [ ] Fix the remaining authz tooling path drift from `logica/...` to `neup.logica/...`, especially `package.json` `getRoles` / `postRoles` and the export/post helper scripts that still target the old snapshot tree.
- [ ] Finish the repo-wide permission literal migration from suffixed names like `.self` / `.managed` / `.root` to the new unsuffixed permission names in page/service declarations and old Prisma maintenance scripts such as `prisma/scripts/runner-neupaccount.ts`.
- [ ] Add a Neup documentation block for `app/(manage)/config/socials/social-links-manager.tsx`, which currently exposes the socials editor UI without structured source-owned documentation.
- [ ] Upgrade `neup.core/helpers/link.ts` to `documentation.guide.md` with Neup documentation blocks instead of plain comments.
- [ ] Upgrade `neup.core/helper/navigation.ts` to `documentation.guide.md` with Neup documentation blocks instead of plain comments.
- [ ] Add Neup documentation blocks for the root account management pages in `app/(manage)/manage/[id]/page.tsx`, `app/(manage)/manage/[id]/permissions/page.tsx`, and `app/(manage)/manage/[id]/verification/page.tsx`, which currently expose management flows without structured page-level documentation.
- [ ] Add Neup documentation blocks for the managed account access module in `app/(manage)/manage/[id]/access/form.tsx`, `services/manage/users.ts`, `app/(manage)/manage/layout.tsx`, and `neup.core/auth/account-access-permissions.ts`, which currently rely on plain comments or no structured documentation.
- [ ] Upgrade access people services/pages documentation for `services/manage/people/family.ts`, `services/manage/people/invitations.ts`, `services/manage/people/blocked.ts`, `app/(manage)/access/family/page.tsx`, `app/(manage)/access/invitations/page.tsx`, and `app/(manage)/access/blocked/page.tsx` so they use Neup documentation blocks instead of plain comments or no structured page documentation.
- [ ] Add Neup documentation blocks for selected-account access pages in `app/(manage)/access/page.tsx`, `app/(manage)/access/connection/page.tsx`, and `app/(manage)/access/application/page.tsx`.
- [ ] Add Neup documentation blocks for selected-account profile detail pages in `app/(manage)/profile/display/page.tsx`, `app/(manage)/profile/legal/page.tsx`, `app/(manage)/profile/contact/page.tsx`, `app/(manage)/profile/neupid/page.tsx`, `app/(manage)/profile/demographics/page.tsx`, and `app/(manage)/profile/documents/page.tsx`.
- [ ] Upgrade KYC profile document service documentation in `services/manage/profile/documents.ts` so it uses Neup documentation blocks instead of plain comments.
- [ ] Upgrade managed-account NeupID service documentation in `services/manage/accounts/neupid.ts` so it uses Neup documentation blocks instead of plain comments.
- [ ] Add Neup documentation blocks for shared UI/metadata helpers in `components/ui/list-item.tsx`, `components/ui/primary-header.tsx`, and `neup.core/metadata.ts`.
- [ ] Add Neup documentation blocks for selected-account create-account pages and services in `app/(manage)/access/createAccount/page.tsx`, `app/(manage)/access/createAccount/brand-page-client.tsx`, `app/(manage)/access/createAccount/dependent-page-client.tsx`, `app/(manage)/access/createAccount/subbrand-page-client.tsx`, `services/manage/accounts/brand.ts`, `services/manage/accounts/dependent.ts`, and `services/manage/accounts/subbrands.ts`.
- [ ] Add Neup documentation blocks for selected-account link-account pages and services in `app/(manage)/access/link/page.tsx`, `app/(manage)/access/link/whatsapp/page.tsx`, `app/(manage)/access/link/whatsapp/page.client.tsx`, and `services/manage/accounts/whatsapp.ts`.
- [ ] Add Neup documentation blocks for the root and dashboard layout/session shell files in `app/layout.tsx`, `app/(manage)/layout.tsx`, `app/(manage)/layout-shell.tsx`, and `neup.core/providers/session.tsx`.
