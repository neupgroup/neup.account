ALTER TABLE "authz_permission"
ADD COLUMN IF NOT EXISTS "scope" TEXT;

UPDATE "authz_role"
SET "scope" = 'default'
WHERE "scope" IS NULL OR btrim("scope") = '';

UPDATE "authz_permission" p
SET "scope" = COALESCE(
  NULLIF(btrim(
    CASE
      WHEN jsonb_typeof(p."tag"::jsonb) = 'string' THEN trim(both '"' from p."tag"::text)
      WHEN jsonb_typeof(p."tag"::jsonb) = 'object' THEN p."tag"::jsonb ->> 'scope'
      ELSE NULL
    END
  ), ''),
  (
    SELECT NULLIF(btrim(r."scope"), '')
    FROM "authz_role_permission_map" rpm
    JOIN "authz_role" r ON r."id" = rpm."role_id"
    WHERE rpm."permission_id" = p."id"
      AND r."scope" IS NOT NULL
      AND btrim(r."scope") <> ''
    ORDER BY r."scope"
    LIMIT 1
  ),
  'default'
)
WHERE p."scope" IS NULL OR btrim(p."scope") = '';

ALTER TABLE "authz_permission"
ALTER COLUMN "scope" SET NOT NULL;

ALTER TABLE "authz_role"
ALTER COLUMN "scope" SET NOT NULL;
