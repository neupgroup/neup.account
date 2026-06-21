DELETE FROM "authz_role_permission_map" map
USING "authz_permission" permission
WHERE map."role_id" = 'application.owner'
  AND map."permission_id" = permission."id"
  AND permission."name" = 'application.create'
  AND permission."app_id" = 'neup.account';

UPDATE "authz_role"
SET "permissions" = (
  SELECT COALESCE(jsonb_agg(to_jsonb(permission_name) ORDER BY permission_name), '[]'::jsonb)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(COALESCE("permissions", '[]'::jsonb)) AS permission_name
  ) AS existing_permissions
  WHERE permission_name <> 'application.create'
)
WHERE "id" = 'application.owner';

UPDATE "role"
SET "permissions" = (
  SELECT COALESCE(jsonb_agg(to_jsonb(permission_name) ORDER BY permission_name), '[]'::jsonb)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(COALESCE("permissions", '[]'::jsonb)) AS permission_name
  ) AS existing_permissions
  WHERE permission_name <> 'application.create'
)
WHERE "role_id" = 'application.owner';
