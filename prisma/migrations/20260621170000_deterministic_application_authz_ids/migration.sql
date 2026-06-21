CREATE OR REPLACE FUNCTION public.slugify_authz_identifier(input_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(COALESCE(input_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

WITH application_candidates AS (
  SELECT
    id AS old_id,
    COALESCE(NULLIF(regexp_replace(COALESCE(name, ''), '[^0-9A-Za-z]+', '', 'g'), ''), 'app') AS prefix,
    substring(md5(id), 1, 9) AS suffix
  FROM "application"
  WHERE id <> 'neup.account'
    AND id !~ '^[0-9A-Za-z]+\.[0-9a-z]{9}$'
)
UPDATE "application" AS application
SET "id" = application_candidates.prefix || '.' || application_candidates.suffix
FROM application_candidates
WHERE application."id" = application_candidates.old_id;

WITH permission_candidates AS (
  SELECT
    id AS old_id,
    app_id,
    COALESCE(NULLIF(public.slugify_authz_identifier(name), ''), 'permission') AS base_slug,
    row_number() OVER (
      PARTITION BY app_id, COALESCE(NULLIF(public.slugify_authz_identifier(name), ''), 'permission')
      ORDER BY id
    ) AS ordinal
  FROM "authz_permission"
  WHERE app_id IS NOT NULL
    AND app_id <> 'neup.account'
),
permission_updates AS (
  SELECT
    old_id,
    app_id || '.' || base_slug ||
      CASE WHEN ordinal = 1 THEN '' ELSE '-' || ordinal::TEXT END AS new_id
  FROM permission_candidates
)
UPDATE "authz_permission" AS permission
SET "id" = permission_updates.new_id
FROM permission_updates
WHERE permission."id" = permission_updates.old_id
  AND permission."id" <> permission_updates.new_id;

WITH role_candidates AS (
  SELECT
    id AS old_id,
    app_id,
    COALESCE(NULLIF(public.slugify_authz_identifier(name), ''), 'role') AS base_slug,
    row_number() OVER (
      PARTITION BY app_id, COALESCE(NULLIF(public.slugify_authz_identifier(name), ''), 'role')
      ORDER BY id
    ) AS ordinal
  FROM "authz_role"
  WHERE app_id IS NOT NULL
    AND app_id <> 'neup.account'
),
role_updates AS (
  SELECT
    old_id,
    app_id || '.' || base_slug ||
      CASE WHEN ordinal = 1 THEN '' ELSE '-' || ordinal::TEXT END AS new_id
  FROM role_candidates
)
UPDATE "authz_role" AS role
SET "id" = role_updates.new_id
FROM role_updates
WHERE role."id" = role_updates.old_id
  AND role."id" <> role_updates.new_id;

UPDATE "authz_role" AS role
SET "permissions" = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(mapped.permission_id) ORDER BY mapped.permission_id)
    FROM (
      SELECT DISTINCT map."permission_id"
      FROM "authz_role_permission_map" AS map
      WHERE map."role_id" = role."id"
    ) AS mapped
  ),
  '[]'::jsonb
)
WHERE role."app_id" IS NOT NULL
  AND role."app_id" <> 'neup.account';

UPDATE "role" AS legacy_role
SET "permissions" = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(mapped.permission_id) ORDER BY mapped.permission_id)
    FROM (
      SELECT DISTINCT map."permission_id"
      FROM "authz_role_permission_map" AS map
      WHERE map."role_id" = legacy_role."role_id"
    ) AS mapped
  ),
  '[]'::jsonb
)
WHERE EXISTS (
  SELECT 1
  FROM "authz_role" AS authz_role
  WHERE authz_role."id" = legacy_role."role_id"
    AND authz_role."app_id" IS NOT NULL
    AND authz_role."app_id" <> 'neup.account'
);

DROP FUNCTION public.slugify_authz_identifier(TEXT);
