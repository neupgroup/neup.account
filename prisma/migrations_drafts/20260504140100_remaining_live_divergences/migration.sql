-- Fix remaining Live Database -> Expected Database Schema divergences (per `schema.md`).
-- WARNING: This migration is destructive (drops legacy tables/columns) to match the expected schema.

BEGIN;

-- 1) Families -> family + family_member
DO $$
BEGIN
  IF to_regclass('public.families') IS NOT NULL AND to_regclass('public.family') IS NULL THEN
    EXECUTE 'ALTER TABLE families RENAME TO family';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.family') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='family' AND column_name='createdBy') THEN
      EXECUTE 'ALTER TABLE family RENAME COLUMN "createdBy" TO created_by';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='family' AND column_name='createdAt') THEN
      EXECUTE 'ALTER TABLE family RENAME COLUMN "createdAt" TO created_at';
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS family
  ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

ALTER TABLE IF EXISTS family
  DROP COLUMN IF EXISTS "memberIds",
  DROP COLUMN IF EXISTS members,
  DROP COLUMN IF EXISTS "updatedAt";

CREATE TABLE IF NOT EXISTS family_member (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  family_id text NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  CONSTRAINT family_member_role_check CHECK (role IN ('member','owner','parent','child')),
  CONSTRAINT family_member_family_member_key UNIQUE (family_id, member_id)
);

-- 2) Verification: reshape table to expected schema (table is currently empty in live DB)
DO $$
BEGIN
  IF to_regclass('public.verification') IS NOT NULL THEN
    EXECUTE 'DROP TABLE verification';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_previously') THEN
    EXECUTE 'CREATE TYPE verification_previously AS ENUM (''attempted'',''disqualified'',''cancelled'',''verified'')';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  category text,
  done_by text REFERENCES account(id) ON DELETE SET NULL,
  done_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previously verification_previously
);

-- 3) Application: move legacy fields into details, add isInternal, rename createdAt
ALTER TABLE IF EXISTS application
  ADD COLUMN IF NOT EXISTS "isInternal" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details jsonb;

-- Persist legacy columns inside `details` before dropping them.
UPDATE application
SET
  details = COALESCE(details, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'access', access,
      'policies', policies,
      'accessTo', "accessTo",
      'party', party
    )),
  "isInternal" = CASE WHEN party = 'first' THEN true ELSE false END
WHERE
  (details IS NULL OR details = '{}'::jsonb)
  OR party IS NOT NULL
  OR "accessTo" IS NOT NULL
  OR access IS NOT NULL
  OR policies IS NOT NULL;

ALTER TABLE IF EXISTS application DROP CONSTRAINT IF EXISTS applications_ownerAccountId_fkey;

ALTER TABLE IF EXISTS application
  DROP COLUMN IF EXISTS party,
  DROP COLUMN IF EXISTS "accessTo",
  DROP COLUMN IF EXISTS access,
  DROP COLUMN IF EXISTS policies;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE application RENAME COLUMN "createdAt" TO created_at';
  END IF;
END $$;

-- 4) application_connection: snake_case columns
ALTER TABLE IF EXISTS application_connection
  ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='accountId') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN "accountId" TO account_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='appId') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN "appId" TO app_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='connectedAt') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN "connectedAt" TO connected_at';
  END IF;
END $$;

-- 5) application_bridge: snake_case columns
ALTER TABLE IF EXISTS application_bridge
  ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_bridge' AND column_name='appId') THEN
    EXECUTE 'ALTER TABLE application_bridge RENAME COLUMN "appId" TO app_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_bridge' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE application_bridge RENAME COLUMN "createdAt" TO created_at';
  END IF;
END $$;

-- 6) application_policies: new table
CREATE TABLE IF NOT EXISTS application_policies (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  app_id text NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  policy_type text NOT NULL,
  policy_value jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS application_policies_app_id_policy_type_idx ON application_policies(app_id, policy_type);

-- 7) authz_* tables: new authorization model
CREATE TABLE IF NOT EXISTS authz_capability (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name text NOT NULL,
  description text,
  app_id text REFERENCES application(id) ON DELETE SET NULL,
  scope text
);

CREATE TABLE IF NOT EXISTS authz_role (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name text NOT NULL,
  permissions text[] DEFAULT '{}',
  description text,
  app_id text REFERENCES application(id) ON DELETE SET NULL,
  scope text
);

CREATE TABLE IF NOT EXISTS authz_role_capability_map (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  role_id text NOT NULL REFERENCES authz_role(id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES authz_capability(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS authz_account_access_grant (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  owner_account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  target_account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES authz_role(id) ON DELETE CASCADE,
  app_id text NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  portfolio_id text REFERENCES portfolio(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS authz_account_access_grant_owner_account_id_idx ON authz_account_access_grant(owner_account_id);
CREATE INDEX IF NOT EXISTS authz_account_access_grant_target_account_id_idx ON authz_account_access_grant(target_account_id);
CREATE INDEX IF NOT EXISTS authz_account_access_grant_role_id_idx ON authz_account_access_grant(role_id);
CREATE INDEX IF NOT EXISTS authz_account_access_grant_app_id_idx ON authz_account_access_grant(app_id);

CREATE TABLE IF NOT EXISTS assets_access_grant (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "assetId" text NOT NULL REFERENCES portfolio_asset(id) ON DELETE CASCADE,
  target_account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES authz_role(id) ON DELETE CASCADE,
  portfolio_id text NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS assets_access_grant_asset_id_idx ON assets_access_grant("assetId");
CREATE INDEX IF NOT EXISTS assets_access_grant_target_account_id_idx ON assets_access_grant(target_account_id);
CREATE INDEX IF NOT EXISTS assets_access_grant_role_id_idx ON assets_access_grant(role_id);
CREATE INDEX IF NOT EXISTS assets_access_grant_portfolio_id_idx ON assets_access_grant(portfolio_id);

-- 8) Legacy table cleanup: permit / portfolio_role / account_ownership
-- Migrate permit records into authz_role + authz_account_access_grant, then drop legacy tables.
DO $$
DECLARE
  selected_app_id text;
BEGIN
  SELECT id INTO selected_app_id FROM application ORDER BY created_at NULLS LAST, id LIMIT 1;
  IF to_regclass('public.permit') IS NOT NULL AND selected_app_id IS NOT NULL THEN
    INSERT INTO authz_role(name, permissions, description, scope)
    SELECT
      'permit:' || p.id,
      COALESCE(p.permissions, ARRAY[]::text[]),
      'Imported from legacy permit table',
      CASE WHEN p."isRoot" THEN 'global' ELSE 'account' END
    FROM permit p
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO authz_account_access_grant(owner_account_id, target_account_id, role_id, app_id, portfolio_id)
    SELECT
      p."accountId",
      COALESCE(p."memberId", p."accountId"),
      r.id,
      selected_app_id,
      NULL
    FROM permit p
    JOIN authz_role r ON r.name = ('permit:' || p.id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS permit;
DROP TABLE IF EXISTS portfolio_role;
DROP TABLE IF EXISTS account_ownership;

-- 9) Portfolio id defaults
ALTER TABLE IF EXISTS portfolio ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS portfolio_asset ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS portfolio_member ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

-- 10) system_error: drop extra columns + set id default
ALTER TABLE IF EXISTS system_error ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS system_error
  DROP COLUMN IF EXISTS "problemLevel",
  DROP COLUMN IF EXISTS "reproSteps",
  DROP COLUMN IF EXISTS solution,
  DROP COLUMN IF EXISTS "solvedBy",
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS type;

-- 11) system_config: auto-update updatedAt via trigger
CREATE OR REPLACE FUNCTION set_updatedat_timestamp() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.system_config') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='system_config_set_updatedAt'
  ) THEN
    EXECUTE 'CREATE TRIGGER system_config_set_updatedAt BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION set_updatedat_timestamp()';
  END IF;
END $$;

COMMIT;

