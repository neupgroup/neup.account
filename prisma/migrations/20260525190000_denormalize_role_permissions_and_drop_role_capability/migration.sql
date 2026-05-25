-- Add denormalized permissions to roles
ALTER TABLE "authz_role"
ADD COLUMN "permissions" JSONB;

-- Backfill from authz_role_capability + authz_capability
WITH role_permissions AS (
  SELECT
    arc."role_id",
    jsonb_agg(DISTINCT cap."name") AS permissions
  FROM "authz_role_capability" arc
  JOIN "authz_capability" cap
    ON cap."id" = arc."capability_id"
  GROUP BY arc."role_id"
)
UPDATE "authz_role" r
SET "permissions" = rp.permissions
FROM role_permissions rp
WHERE r."id" = rp."role_id";

-- Normalize empty permissions to []
UPDATE "authz_role"
SET "permissions" = '[]'::jsonb
WHERE "permissions" IS NULL;

-- Drop old mapping table
DROP TABLE IF EXISTS "authz_role_capability" CASCADE;
