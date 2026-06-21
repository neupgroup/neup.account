ALTER TABLE "authz_role_permission_map"
  ADD COLUMN IF NOT EXISTS "scope" TEXT;

UPDATE "authz_role_permission_map" AS map
SET "scope" = role."scope"
FROM "authz_role" AS role
WHERE role."id" = map."role_id"
  AND map."scope" IS NULL;

ALTER TABLE "authz_role_permission_map"
  ALTER COLUMN "scope" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "authz_role_permission_map_scope_idx"
  ON "authz_role_permission_map"("scope");
