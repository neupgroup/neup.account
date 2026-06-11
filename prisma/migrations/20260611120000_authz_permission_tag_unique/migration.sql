DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'authz_permission'
      AND column_name = 'scope'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'authz_permission'
      AND column_name = 'tag'
  ) THEN
    ALTER TABLE "authz_permission" RENAME COLUMN "scope" TO "tag";
  END IF;
END $$;

ALTER TABLE "authz_permission"
  ALTER COLUMN "tag" TYPE JSONB
  USING CASE
    WHEN "tag" IS NULL THEN NULL
    ELSE to_jsonb("tag")
  END;

WITH duplicate_permissions AS (
  SELECT
    id,
    MIN(id) OVER (PARTITION BY name, app_id) AS keep_id
  FROM "authz_permission"
  WHERE app_id IS NOT NULL
),
permission_replacements AS (
  SELECT id, keep_id
  FROM duplicate_permissions
  WHERE id <> keep_id
),
conflicting_role_maps AS (
  SELECT map.id
  FROM "authz_role_permission_map" map
  JOIN permission_replacements replacement
    ON replacement.id = map.permission_id
  WHERE EXISTS (
    SELECT 1
    FROM "authz_role_permission_map" existing
    WHERE existing.role_id = map.role_id
      AND existing.permission_id = replacement.keep_id
  )
)
DELETE FROM "authz_role_permission_map" map
USING conflicting_role_maps conflict
WHERE map.id = conflict.id;

WITH duplicate_permissions AS (
  SELECT
    id,
    MIN(id) OVER (PARTITION BY name, app_id) AS keep_id
  FROM "authz_permission"
  WHERE app_id IS NOT NULL
),
permission_replacements AS (
  SELECT id, keep_id
  FROM duplicate_permissions
  WHERE id <> keep_id
)
UPDATE "authz_role_permission_map" map
SET permission_id = replacement.keep_id
FROM permission_replacements replacement
WHERE map.permission_id = replacement.id;

WITH duplicate_permissions AS (
  SELECT
    id,
    MIN(id) OVER (PARTITION BY name, app_id) AS keep_id
  FROM "authz_permission"
  WHERE app_id IS NOT NULL
)
DELETE FROM "authz_permission" permission
USING duplicate_permissions duplicate
WHERE permission.id = duplicate.id
  AND duplicate.id <> duplicate.keep_id;

CREATE UNIQUE INDEX "authz_permission_name_app_id_key"
  ON "authz_permission"("name", "app_id");
