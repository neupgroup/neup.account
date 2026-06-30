ALTER TABLE "authz_permission"
ADD COLUMN IF NOT EXISTS "scope_for" jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "scope_level" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "authz_permission"
SET
  "scope_for" = CASE
    WHEN COALESCE("scope"::text, '') ILIKE '%brandSubbrand%' THEN '["for_brand","for_subBrand"]'::jsonb
    WHEN COALESCE("scope"::text, '') ILIKE '%subbrand%' OR COALESCE("scope"::text, '') ILIKE '%branch%' THEN '["for_subBrand"]'::jsonb
    WHEN COALESCE("scope"::text, '') ILIKE '%brand%' THEN '["for_brand"]'::jsonb
    ELSE '["for_individual"]'::jsonb
  END,
  "scope_level" = CASE
    WHEN "acquisition_type" = 'system_generated' THEN '["selfAssigned"]'::jsonb
    WHEN "acquisition_type" = 'invitation' AND "approval_policy" = 'approval_required' THEN '["requestableToOwner"]'::jsonb
    WHEN "acquisition_type" = 'invitation' THEN '["rootManaged"]'::jsonb
    WHEN "acquisition_type" = 'public_request' AND "approval_policy" = 'approval_required' THEN '["publiclyRequestable"]'::jsonb
    WHEN "acquisition_type" = 'public_request' THEN '["publiclyEnrollable"]'::jsonb
    ELSE '["assignable"]'::jsonb
  END;

ALTER TABLE "authz_role"
ADD COLUMN IF NOT EXISTS "scope_for" jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "scope_level" text NOT NULL DEFAULT 'assignable';

UPDATE "authz_role"
SET
  "scope_for" = CASE
    WHEN "scope"::text ILIKE '%brandSubbrand%' THEN '["for_brand","for_subBrand"]'::jsonb
    WHEN "scope"::text ILIKE '%subbrand%' OR "scope"::text ILIKE '%branch%' THEN '["for_subBrand"]'::jsonb
    WHEN "scope"::text ILIKE '%brand%' THEN '["for_brand"]'::jsonb
    ELSE '["for_individual"]'::jsonb
  END,
  "scope_level" = CASE
    WHEN "acquisition_type" = 'system_generated' THEN 'selfAssigned'
    WHEN "acquisition_type" = 'invitation' AND "approval_policy" = 'approval_required' THEN 'requestableToOwner'
    WHEN "acquisition_type" = 'invitation' THEN 'rootManaged'
    WHEN "acquisition_type" = 'public_request' AND "approval_policy" = 'approval_required' THEN 'publiclyRequestable'
    WHEN "acquisition_type" = 'public_request' THEN 'publiclyEnrollable'
    ELSE 'assignable'
  END;

ALTER TABLE "authz_role_permission_map"
ADD COLUMN IF NOT EXISTS "scope_for" text,
ADD COLUMN IF NOT EXISTS "scope_level" text;

UPDATE "authz_role_permission_map" map
SET
  "scope_for" = COALESCE(
    (
      SELECT CASE
        WHEN role."scope"::text ILIKE '%brandSubbrand%' THEN 'for_brand'
        WHEN role."scope"::text ILIKE '%subbrand%' OR role."scope"::text ILIKE '%branch%' THEN 'for_subBrand'
        WHEN role."scope"::text ILIKE '%brand%' THEN 'for_brand'
        ELSE 'for_individual'
      END
      FROM "authz_role" role
      WHERE role."id" = map."role_id"
    ),
    'for_individual'
  ),
  "scope_level" = COALESCE(
    (
      SELECT CASE
        WHEN role."acquisition_type" = 'system_generated' THEN 'selfAssigned'
        WHEN role."acquisition_type" = 'invitation' AND role."approval_policy" = 'approval_required' THEN 'requestableToOwner'
        WHEN role."acquisition_type" = 'invitation' THEN 'rootManaged'
        WHEN role."acquisition_type" = 'public_request' AND role."approval_policy" = 'approval_required' THEN 'publiclyRequestable'
        WHEN role."acquisition_type" = 'public_request' THEN 'publiclyEnrollable'
        ELSE 'assignable'
      END
      FROM "authz_role" role
      WHERE role."id" = map."role_id"
    ),
    'assignable'
  );

ALTER TABLE "authz_role_permission_map"
ALTER COLUMN "scope_for" SET NOT NULL,
ALTER COLUMN "scope_level" SET NOT NULL;

DROP INDEX IF EXISTS "authz_role_permission_map_role_permission_key";

CREATE UNIQUE INDEX "authz_role_permission_map_role_permission_scope_key"
ON "authz_role_permission_map"("role_id", "permission_id", "scope_for", "scope_level");
