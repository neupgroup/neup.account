ALTER TABLE "authz_permission"
  ALTER COLUMN "acquisition_type" DROP DEFAULT;

ALTER TABLE "authz_permission"
  ALTER COLUMN "acquisition_type" TYPE jsonb
  USING COALESCE("scope_for", '[]'::jsonb);

ALTER TABLE "authz_permission"
  ALTER COLUMN "acquisition_type" SET DEFAULT '[]'::jsonb;

ALTER TABLE "authz_permission"
  DROP COLUMN "scope_for";
