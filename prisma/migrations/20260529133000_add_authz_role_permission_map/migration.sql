CREATE TABLE IF NOT EXISTS "authz_role_permission_map" (
  "id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "authz_role_permission_map_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "authz_role_permission_map_role_permission_key"
  ON "authz_role_permission_map"("role_id", "permission_id");

CREATE INDEX IF NOT EXISTS "authz_role_permission_map_role_id_idx"
  ON "authz_role_permission_map"("role_id");

CREATE INDEX IF NOT EXISTS "authz_role_permission_map_permission_id_idx"
  ON "authz_role_permission_map"("permission_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'authz_role_permission_map_role_id_fkey'
  ) THEN
    ALTER TABLE "authz_role_permission_map"
      ADD CONSTRAINT "authz_role_permission_map_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "authz_role"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'authz_role_permission_map_permission_id_fkey'
  ) THEN
    ALTER TABLE "authz_role_permission_map"
      ADD CONSTRAINT "authz_role_permission_map_permission_id_fkey"
      FOREIGN KEY ("permission_id") REFERENCES "authz_permission"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill mapping table from denormalized authz_role.permissions JSON.
WITH role_permissions AS (
  SELECT
    r.id AS role_id,
    r.app_id,
    elem AS permission_item
  FROM "authz_role" r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.permissions::jsonb, '[]'::jsonb)) elem
),
resolved AS (
  SELECT DISTINCT
    rp.role_id,
    COALESCE(
      NULLIF(rp.permission_item->>'id', ''),
      p_by_name.id
    ) AS permission_id
  FROM role_permissions rp
  LEFT JOIN "authz_permission" p_by_name
    ON p_by_name.name = rp.permission_item->>'name'
   AND (
        p_by_name.app_id = rp.app_id
        OR (p_by_name.app_id IS NULL AND rp.app_id IS NULL)
       )
  WHERE jsonb_typeof(rp.permission_item) = 'object'

  UNION

  SELECT DISTINCT
    rp.role_id,
    p_by_name.id AS permission_id
  FROM role_permissions rp
  JOIN "authz_permission" p_by_name
    ON p_by_name.name = trim(both '"' from rp.permission_item::text)
   AND (
        p_by_name.app_id = rp.app_id
        OR (p_by_name.app_id IS NULL AND rp.app_id IS NULL)
       )
  WHERE jsonb_typeof(rp.permission_item) = 'string'
)
INSERT INTO "authz_role_permission_map" ("id", "role_id", "permission_id")
SELECT
  md5(resolved.role_id || ':' || resolved.permission_id),
  resolved.role_id,
  resolved.permission_id
FROM resolved
WHERE resolved.permission_id IS NOT NULL
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
