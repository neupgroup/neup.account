-- Restructure member and assets tables and add role table with denormalized snapshots.

-- ---------------------------------------------------------------------------
-- MEMBER TABLE
-- ---------------------------------------------------------------------------

ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "member_type" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "member_account_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "member_connection_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "parent_type" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "is_permanent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "access_level" TEXT NOT NULL DEFAULT 'limited';
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "details" JSONB;
-- Ensure legacy source columns exist in partially-migrated environments.
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "member_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "access_to" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "access_for" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "parent_application_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "parent_connection_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "role_id" TEXT;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "hasFullAccess" BOOLEAN;
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "isPermanent" BOOLEAN;

UPDATE "member"
SET
  "member_type" = COALESCE(
    "member_type",
    CASE
      WHEN "member_connection_id" IS NOT NULL OR "parent_connection_id" IS NOT NULL THEN 'connection'
      ELSE 'account'
    END
  ),
  "member_account_id" = COALESCE("member_account_id", "member_id"),
  "member_connection_id" = COALESCE("member_connection_id", "parent_connection_id"),
  "parent_type" = COALESCE(
    "parent_type",
    CASE
      WHEN "parent_portfolio_id" IS NOT NULL THEN 'portfolio'
      ELSE 'account'
    END
  ),
  "parent_account_id" = COALESCE("parent_account_id", "access_to"),
  "is_permanent" = COALESCE("is_permanent", false),
  "access_level" = COALESCE(
    "access_level",
    CASE WHEN COALESCE("hasFullAccess", false) THEN 'full' ELSE 'limited' END
  ),
  "details" = COALESCE("details", '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'legacy_access_to', "access_to",
      'legacy_access_for', "access_for",
      'legacy_parent_application_id', "parent_application_id",
      'legacy_parent_connection_id', "parent_connection_id",
      'legacy_role_id', "role_id",
      'legacy_has_full_access', "hasFullAccess"
    )
  );

UPDATE "member" SET "member_type" = 'account' WHERE "member_type" IS NULL;
UPDATE "member" SET "parent_type" = 'account' WHERE "parent_type" IS NULL;

ALTER TABLE "member" ALTER COLUMN "member_type" SET NOT NULL;
ALTER TABLE "member" ALTER COLUMN "parent_type" SET NOT NULL;

DROP INDEX IF EXISTS "member_member_id_idx";
DROP INDEX IF EXISTS "member_access_to_idx";
DROP INDEX IF EXISTS "member_access_for_idx";
DROP INDEX IF EXISTS "member_parent_application_id_idx";
DROP INDEX IF EXISTS "member_parent_connection_id_idx";
DROP INDEX IF EXISTS "member_role_id_idx";

ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_member_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_access_to_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_parent_application_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_parent_connection_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_role_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_member_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_access_to_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_parent_application_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_parent_connection_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_role_id_fkey";

ALTER TABLE "member" DROP COLUMN IF EXISTS "member_id";
ALTER TABLE "member" DROP COLUMN IF EXISTS "access_to";
ALTER TABLE "member" DROP COLUMN IF EXISTS "access_for";
ALTER TABLE "member" DROP COLUMN IF EXISTS "parent_application_id";
ALTER TABLE "member" DROP COLUMN IF EXISTS "parent_connection_id";
ALTER TABLE "member" DROP COLUMN IF EXISTS "role_id";
ALTER TABLE "member" DROP COLUMN IF EXISTS "isPermanent";
ALTER TABLE "member" DROP COLUMN IF EXISTS "hasFullAccess";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_member_account_id_fkey') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_member_account_id_fkey"
      FOREIGN KEY ("member_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_member_connection_id_fkey') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_member_connection_id_fkey"
      FOREIGN KEY ("member_connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_parent_account_id_fkey') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_parent_account_id_fkey"
      FOREIGN KEY ("parent_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_parent_portfolio_id_fkey') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_parent_portfolio_id_fkey"
      FOREIGN KEY ("parent_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "member_member_type_idx" ON "member"("member_type");
CREATE INDEX IF NOT EXISTS "member_member_account_id_idx" ON "member"("member_account_id");
CREATE INDEX IF NOT EXISTS "member_member_connection_id_idx" ON "member"("member_connection_id");
CREATE INDEX IF NOT EXISTS "member_parent_type_idx" ON "member"("parent_type");
CREATE INDEX IF NOT EXISTS "member_parent_account_id_idx" ON "member"("parent_account_id");
CREATE INDEX IF NOT EXISTS "member_parent_portfolio_id_idx" ON "member"("parent_portfolio_id");
CREATE INDEX IF NOT EXISTS "member_access_level_idx" ON "member"("access_level");

-- ---------------------------------------------------------------------------
-- ASSETS TABLE
-- ---------------------------------------------------------------------------

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_account_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_application_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_connection_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_portfolio_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_other_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parent_account_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parent_portfolio_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "is_main_owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
-- Ensure legacy source columns exist in partially-migrated environments.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parent_portfolio" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parent_account" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "child_account" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "child_application" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "child_connection" TEXT;

UPDATE "assets"
SET
  "asset_account_id" = COALESCE("asset_account_id", "child_account"),
  "asset_application_id" = COALESCE("asset_application_id", "child_application"),
  "asset_connection_id" = COALESCE("asset_connection_id", "child_connection"),
  "parent_account_id" = COALESCE("parent_account_id", "parent_account"),
  "parent_portfolio_id" = COALESCE("parent_portfolio_id", "parent_portfolio"),
  "is_main_owner" = COALESCE("is_main_owner", false),
  "status" = COALESCE(NULLIF("status", ''), 'active'),
  "details" = COALESCE("details", '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'legacy_parent_portfolio', "parent_portfolio",
      'legacy_parent_account', "parent_account",
      'legacy_child_account', "child_account",
      'legacy_child_application', "child_application",
      'legacy_child_connection', "child_connection"
    )
  );

DROP INDEX IF EXISTS "assets_asset_type_child_account_idx";
DROP INDEX IF EXISTS "assets_asset_type_child_application_idx";
DROP INDEX IF EXISTS "assets_asset_type_child_connection_idx";
DROP INDEX IF EXISTS "assets_parent_portfolio_idx";
DROP INDEX IF EXISTS "assets_parent_account_idx";

ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_account_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_application_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_connection_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parent_account_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parent_portfolio_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_account_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_application_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_child_connection_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parent_account_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parent_portfolio_fkey";

ALTER TABLE "assets" DROP COLUMN IF EXISTS "parent_portfolio";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "parent_account";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "child_account";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "child_application";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "child_connection";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_asset_account_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_asset_account_id_fkey"
      FOREIGN KEY ("asset_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_asset_application_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_asset_application_id_fkey"
      FOREIGN KEY ("asset_application_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_asset_connection_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_asset_connection_id_fkey"
      FOREIGN KEY ("asset_connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_parent_account_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_parent_account_id_fkey"
      FOREIGN KEY ("parent_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_parent_portfolio_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_parent_portfolio_id_fkey"
      FOREIGN KEY ("parent_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_asset_portfolio_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_asset_portfolio_id_fkey"
      FOREIGN KEY ("asset_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "assets_asset_type_asset_account_id_idx" ON "assets"("asset_type", "asset_account_id");
CREATE INDEX IF NOT EXISTS "assets_asset_type_asset_application_id_idx" ON "assets"("asset_type", "asset_application_id");
CREATE INDEX IF NOT EXISTS "assets_asset_type_asset_connection_id_idx" ON "assets"("asset_type", "asset_connection_id");
CREATE INDEX IF NOT EXISTS "assets_asset_type_asset_portfolio_id_idx" ON "assets"("asset_type", "asset_portfolio_id");
CREATE INDEX IF NOT EXISTS "assets_parent_account_id_idx" ON "assets"("parent_account_id");
CREATE INDEX IF NOT EXISTS "assets_parent_portfolio_id_idx" ON "assets"("parent_portfolio_id");

-- ---------------------------------------------------------------------------
-- ROLE TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "role" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "account_id" TEXT,
  "connection_id" TEXT,
  "asset_id" TEXT,
  "asset_type" TEXT,
  "asset_id_denorm" TEXT,
  "role_id" TEXT NOT NULL,
  "role_name" TEXT,
  "permissions" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "details" JSONB,
  CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "role" DROP CONSTRAINT IF EXISTS "role_member_id_fkey";
ALTER TABLE "role" DROP CONSTRAINT IF EXISTS "role_account_id_fkey";
ALTER TABLE "role" DROP CONSTRAINT IF EXISTS "role_connection_id_fkey";
ALTER TABLE "role" DROP CONSTRAINT IF EXISTS "role_asset_id_fkey";
ALTER TABLE "role" DROP CONSTRAINT IF EXISTS "role_role_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_member_id_fkey') THEN
    ALTER TABLE "role"
      ADD CONSTRAINT "role_member_id_fkey"
      FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_account_id_fkey') THEN
    ALTER TABLE "role"
      ADD CONSTRAINT "role_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_connection_id_fkey') THEN
    ALTER TABLE "role"
      ADD CONSTRAINT "role_connection_id_fkey"
      FOREIGN KEY ("connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_asset_id_fkey') THEN
    ALTER TABLE "role"
      ADD CONSTRAINT "role_asset_id_fkey"
      FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_role_id_fkey') THEN
    ALTER TABLE "role"
      ADD CONSTRAINT "role_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "role_member_id_idx" ON "role"("member_id");
CREATE INDEX IF NOT EXISTS "role_account_id_idx" ON "role"("account_id");
CREATE INDEX IF NOT EXISTS "role_connection_id_idx" ON "role"("connection_id");
CREATE INDEX IF NOT EXISTS "role_asset_id_idx" ON "role"("asset_id");
CREATE INDEX IF NOT EXISTS "role_asset_type_idx" ON "role"("asset_type");
CREATE INDEX IF NOT EXISTS "role_role_id_idx" ON "role"("role_id");

-- Migrate role assignments from legacy member.role_id into the new role table.
-- We pull role_name/permissions from authz_role as denormalized snapshot fields.
INSERT INTO "role" (
  "id",
  "member_id",
  "account_id",
  "connection_id",
  "asset_id",
  "asset_type",
  "asset_id_denorm",
  "role_id",
  "role_name",
  "permissions",
  "status",
  "details"
)
SELECT
  md5(m.id || ':' || COALESCE(m.details->>'legacy_role_id', '')),
  m.id,
  m.member_account_id,
  m.member_connection_id,
  NULL,
  m.details->>'legacy_access_for',
  NULL,
  m.details->>'legacy_role_id',
  ar.name,
  ar.permissions::jsonb,
  m.status::text,
  jsonb_strip_nulls(
    jsonb_build_object(
      'migrated_from_member', true,
      'legacy_parent_application_id', m.details->>'legacy_parent_application_id',
      'legacy_parent_connection_id', m.details->>'legacy_parent_connection_id'
    )
  )
FROM "member" m
JOIN "authz_role" ar ON ar.id = m.details->>'legacy_role_id'
WHERE m.details ? 'legacy_role_id'
ON CONFLICT ("id") DO NOTHING;
