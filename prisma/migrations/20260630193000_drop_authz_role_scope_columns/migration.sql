ALTER TABLE "authz_role_permission_map"
DROP CONSTRAINT IF EXISTS "authz_role_permission_map_role_permission_scope_key";

DROP INDEX IF EXISTS "authz_role_permission_map_scope_idx";

ALTER TABLE "authz_role"
DROP COLUMN IF EXISTS "scope";

ALTER TABLE "authz_role_permission_map"
DROP COLUMN IF EXISTS "scope";
