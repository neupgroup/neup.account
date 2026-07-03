-- Remove portfolio ownership and access from the account access model.
DO $$
BEGIN
  IF to_regclass('public.access') IS NOT NULL THEN
    DELETE FROM "access"
    WHERE "access_type"::text IN ('acc_in_port', 'app_in_port', 'conn_in_port', 'port_in_acc');

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'access'
        AND column_name = 'parent_portfolio_id'
    ) THEN
      DELETE FROM "access"
      WHERE "parent_portfolio_id" IS NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'access'
        AND column_name = 'asset_portfolio_id'
    ) THEN
      DELETE FROM "access"
      WHERE "asset_portfolio_id" IS NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.assets') IS NOT NULL THEN
    DELETE FROM "assets"
    WHERE "type"::text IN ('acc_in_port', 'app_in_port', 'conn_in_port', 'port_in_acc');

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assets'
        AND column_name = 'parent_portfolio_id'
    ) THEN
      DELETE FROM "assets"
      WHERE "parent_portfolio_id" IS NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assets'
        AND column_name = 'child_portfolio_id'
    ) THEN
      DELETE FROM "assets"
      WHERE "child_portfolio_id" IS NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.member') IS NOT NULL THEN
    DELETE FROM "member"
    WHERE "member_type" = 'acc_in_port';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'member'
        AND column_name = 'parent_portfolio_id'
    ) THEN
      DELETE FROM "member"
      WHERE "parent_portfolio_id" IS NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.authz_assets_access_grant') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'authz_assets_access_grant'
        AND column_name = 'portfolio_id'
    ) THEN
      DELETE FROM "authz_assets_access_grant"
      WHERE "portfolio_id" IS NOT NULL
         OR "asset_type" IN ('acc_in_port', 'app_in_port', 'conn_in_port', 'port_in_acc', 'portfolio');
    ELSE
      DELETE FROM "authz_assets_access_grant"
      WHERE "asset_type" IN ('acc_in_port', 'app_in_port', 'conn_in_port', 'port_in_acc', 'portfolio');
    END IF;
  END IF;
END $$;

DELETE FROM "authz_role_permission_map" rpm
USING "authz_permission" permission
WHERE rpm."permission_id" = permission."id"
  AND permission."name" LIKE 'access.portfolio.%';

UPDATE "authz_role"
SET "permissions" = COALESCE(
  (
    SELECT jsonb_agg(permission_name ORDER BY permission_name)
    FROM jsonb_array_elements_text(COALESCE("permissions", '[]'::jsonb)) AS permission_name
    WHERE permission_name NOT LIKE 'access.portfolio.%'
  ),
  '[]'::jsonb
)
WHERE "permissions" IS NOT NULL;

UPDATE "role"
SET "permissions" = COALESCE(
  (
    SELECT jsonb_agg(permission_name ORDER BY permission_name)
    FROM jsonb_array_elements_text(COALESCE("permissions", '[]'::jsonb)) AS permission_name
    WHERE permission_name NOT LIKE 'access.portfolio.%'
  ),
  '[]'::jsonb
)
WHERE "permissions" IS NOT NULL;

DELETE FROM "authz_permission"
WHERE "name" LIKE 'access.portfolio.%';

DROP INDEX IF EXISTS "access_parent_portfolio_id_idx";
DROP INDEX IF EXISTS "access_asset_portfolio_id_idx";
ALTER TABLE "access" DROP CONSTRAINT IF EXISTS "access_parent_portfolio_id_fkey";
ALTER TABLE "access" DROP CONSTRAINT IF EXISTS "access_asset_portfolio_id_fkey";
ALTER TABLE "access" DROP COLUMN IF EXISTS "parent_portfolio_id";
ALTER TABLE "access" DROP COLUMN IF EXISTS "asset_portfolio_id";

DROP INDEX IF EXISTS "assets_type_child_portfolio_id_idx";
DROP INDEX IF EXISTS "assets_parent_portfolio_id_idx";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parent_portfolio_id_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_portfolio_id_fkey";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "child_portfolio_id";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "parent_portfolio_id";

DROP INDEX IF EXISTS "member_parent_portfolio_id_idx";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_parent_portfolio_id_fkey";
ALTER TABLE "member" DROP COLUMN IF EXISTS "parent_portfolio_id";

DROP INDEX IF EXISTS "authz_assets_access_grant_portfolio_id_idx";
DO $$
BEGIN
  IF to_regclass('public.authz_assets_access_grant') IS NOT NULL THEN
    ALTER TABLE "authz_assets_access_grant" DROP CONSTRAINT IF EXISTS "authz_assets_access_grant_portfolio_id_fkey";
    ALTER TABLE "authz_assets_access_grant" DROP COLUMN IF EXISTS "portfolio_id";
  END IF;
END $$;

DROP TABLE IF EXISTS "portfolio";
