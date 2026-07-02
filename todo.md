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
