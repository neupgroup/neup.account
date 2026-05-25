-- Sync live database schema to match `schema.md` expected schema.
-- NOTE: This migration is intentionally destructive (drops columns/tables) to align with the expected schema.

BEGIN;

-- Ensure text id columns have uuid defaults (stored as text).
ALTER TABLE IF EXISTS account ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS contact ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS activity ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS notification ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS request ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS families ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS verification ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS application_connection ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS application_bridge ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS portfolio ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS portfolio_asset ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS portfolio_member ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS system_error ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS neupid ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS auth_method ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS auth_request ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS auth_session ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

-- account_meta__individual: add missing columns
ALTER TABLE IF EXISTS account_meta__individual
  ADD COLUMN IF NOT EXISTS details jsonb[],
  ADD COLUMN IF NOT EXISTS "roleId" text;

-- account_meta__brand: drop extra + add missing
ALTER TABLE IF EXISTS account_meta__brand
  DROP COLUMN IF EXISTS "dateCreated",
  ADD COLUMN IF NOT EXISTS details jsonb[];

-- neupid: add missing neupId unique and backfill from id for existing rows
ALTER TABLE IF EXISTS neupid
  ADD COLUMN IF NOT EXISTS "neupId" text;
UPDATE neupid SET "neupId" = id WHERE "neupId" IS NULL;
ALTER TABLE IF EXISTS neupid ALTER COLUMN "neupId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS neupid_neupId_key ON neupid("neupId");

-- Rename auth_* tables to authn_* (expected naming)
DO $$
BEGIN
  IF to_regclass('public.auth_method') IS NOT NULL AND to_regclass('public.authn_method') IS NULL THEN
    EXECUTE 'ALTER TABLE auth_method RENAME TO authn_method';
  END IF;
  IF to_regclass('public.auth_request') IS NOT NULL AND to_regclass('public.authn_request') IS NULL THEN
    EXECUTE 'ALTER TABLE auth_request RENAME TO authn_request';
  END IF;
  IF to_regclass('public.auth_session') IS NOT NULL AND to_regclass('public.authn_session') IS NULL THEN
    EXECUTE 'ALTER TABLE auth_session RENAME TO authn_session';
  END IF;
END $$;

ALTER TABLE IF EXISTS authn_method ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS authn_request ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
ALTER TABLE IF EXISTS authn_session ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

-- activity: rename columns to expected snake_case
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity' AND column_name='memberId'
  ) THEN
    EXECUTE 'ALTER TABLE activity RENAME COLUMN \"memberId\" TO target_account_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity' AND column_name='actorAccountId'
  ) THEN
    EXECUTE 'ALTER TABLE activity RENAME COLUMN \"actorAccountId\" TO actor_account_id';
  END IF;
END $$;

-- notification: move requestId/deletableOn into detail, then rename/drop columns
ALTER TABLE IF EXISTS notification ADD COLUMN IF NOT EXISTS detail jsonb;
UPDATE notification
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'request_id', "requestId",
  'deletable_on', "deletableOn"
))
WHERE (detail IS NULL OR detail = '{}'::jsonb);
ALTER TABLE IF EXISTS notification DROP CONSTRAINT IF EXISTS notifications_requestId_fkey;
ALTER TABLE IF EXISTS notification DROP COLUMN IF EXISTS "requestId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification' AND column_name='accountId') THEN
    EXECUTE 'ALTER TABLE notification RENAME COLUMN \"accountId\" TO account_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE notification RENAME COLUMN \"createdAt\" TO created_at';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification' AND column_name='deletableOn') THEN
    EXECUTE 'ALTER TABLE notification RENAME COLUMN \"deletableOn\" TO deletable_on';
  END IF;
END $$;

-- request: rename columns to expected snake_case
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request' AND column_name='recipientId') THEN
    EXECUTE 'ALTER TABLE request RENAME COLUMN \"recipientId\" TO recipient_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE request RENAME COLUMN \"createdAt\" TO created_at';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request' AND column_name='updatedAt') THEN
    EXECUTE 'ALTER TABLE request RENAME COLUMN \"updatedAt\" TO updated_at';
  END IF;
END $$;

-- families -> family, reshape columns, and create family_member table
DO $$
BEGIN
  IF to_regclass('public.families') IS NOT NULL AND to_regclass('public.family') IS NULL THEN
    EXECUTE 'ALTER TABLE families RENAME TO family';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='family' AND column_name='createdBy') THEN
    EXECUTE 'ALTER TABLE family RENAME COLUMN \"createdBy\" TO created_by';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='family' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE family RENAME COLUMN \"createdAt\" TO created_at';
  END IF;
END $$;

ALTER TABLE IF EXISTS family
  DROP COLUMN IF EXISTS "memberIds",
  DROP COLUMN IF EXISTS members,
  DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE IF EXISTS family ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

CREATE TABLE IF NOT EXISTS family_member (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  family_id text NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  CONSTRAINT family_member_role_check CHECK (role IN ('member','owner','parent','child')),
  CONSTRAINT family_member_family_member_key UNIQUE (family_id, member_id)
);

-- verification: reshape to expected schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='verification' AND column_name='accountId') THEN
    EXECUTE 'ALTER TABLE verification RENAME COLUMN \"accountId\" TO account_id';
  END IF;
END $$;

-- Drop live-only columns
ALTER TABLE IF EXISTS verification
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS "verifiedBy",
  DROP COLUMN IF EXISTS "revokedBy",
  DROP COLUMN IF EXISTS "revocationReason",
  DROP COLUMN IF EXISTS "createdAt",
  DROP COLUMN IF EXISTS "verifiedAt",
  DROP COLUMN IF EXISTS "revokedAt";

-- Add expected columns
ALTER TABLE IF EXISTS verification
  ADD COLUMN IF NOT EXISTS done_by text,
  ADD COLUMN IF NOT EXISTS done_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_previously') THEN
    EXECUTE 'CREATE TYPE verification_previously AS ENUM (''attempted'',''disqualified'',''cancelled'',''verified'')';
  END IF;
END $$;

ALTER TABLE IF EXISTS verification
  ADD COLUMN IF NOT EXISTS previously verification_previously;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'verification_done_by_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE verification ADD CONSTRAINT verification_done_by_fkey FOREIGN KEY (done_by) REFERENCES account(id) ON DELETE SET NULL';
  END IF;
END $$;

-- application: drop party/accessTo/access/policies; add isInternal/details; rename createdAt
ALTER TABLE IF EXISTS application DROP CONSTRAINT IF EXISTS applications_ownerAccountId_fkey;

ALTER TABLE IF EXISTS application
  ADD COLUMN IF NOT EXISTS "isInternal" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details jsonb;

UPDATE application
SET details = COALESCE(details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('access', access, 'policies', policies))
WHERE details IS NULL OR details = '{}'::jsonb;

ALTER TABLE IF EXISTS application
  DROP COLUMN IF EXISTS party,
  DROP COLUMN IF EXISTS "accessTo",
  DROP COLUMN IF EXISTS access,
  DROP COLUMN IF EXISTS policies;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE application RENAME COLUMN \"createdAt\" TO created_at';
  END IF;
END $$;

-- application_connection: snake_case columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='accountId') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN \"accountId\" TO account_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='appId') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN \"appId\" TO app_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_connection' AND column_name='connectedAt') THEN
    EXECUTE 'ALTER TABLE application_connection RENAME COLUMN \"connectedAt\" TO connected_at';
  END IF;
END $$;

-- application_bridge: snake_case columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_bridge' AND column_name='appId') THEN
    EXECUTE 'ALTER TABLE application_bridge RENAME COLUMN \"appId\" TO app_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='application_bridge' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE application_bridge RENAME COLUMN \"createdAt\" TO created_at';
  END IF;
END $$;

-- application_policies: new table
CREATE TABLE IF NOT EXISTS application_policies (
  id text PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  app_id text NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  policy_type text NOT NULL,
  policy_value jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS application_policies_app_id_policy_type_idx ON application_policies(app_id, policy_type);

-- authz_* tables (new expected authorization model)
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

-- Backfill: migrate existing permit rows (if any) into authz_role + authz_account_access_grant, then drop legacy tables.
-- This is best-effort and keeps existing permissions data reachable in the new model.
DO $$
DECLARE
  root_role_id text;
BEGIN
  IF to_regclass('public.permit') IS NOT NULL THEN
    INSERT INTO authz_role(name, permissions, description, scope)
    VALUES ('legacy-permit', ARRAY[]::text[], 'Imported from legacy permit table', 'account')
    RETURNING id INTO root_role_id;

    -- Create one role per permit record with its permission list.
    INSERT INTO authz_role(name, permissions, description, scope)
    SELECT
      'permit:' || id,
      COALESCE(permissions, ARRAY[]::text[]),
      'Imported from legacy permit table',
      CASE WHEN "isRoot" THEN 'global' ELSE 'account' END
    FROM permit;

    -- Grant self-access using those roles (app_id left as first application if any; otherwise fails, so skip when none).
    IF EXISTS (SELECT 1 FROM application LIMIT 1) THEN
      INSERT INTO authz_account_access_grant(owner_account_id, target_account_id, role_id, app_id, portfolio_id)
      SELECT
        p."accountId",
        COALESCE(p."memberId", p."accountId"),
        r.id,
        (SELECT id FROM application ORDER BY created_at NULLS LAST, id LIMIT 1),
        NULL
      FROM permit p
      JOIN authz_role r ON r.name = ('permit:' || p.id);
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS permit;
DROP TABLE IF EXISTS portfolio_role;
DROP TABLE IF EXISTS account_ownership;

-- system_error: drop extra columns not in expected schema
ALTER TABLE IF EXISTS system_error
  DROP COLUMN IF EXISTS "problemLevel",
  DROP COLUMN IF EXISTS "reproSteps",
  DROP COLUMN IF EXISTS solution,
  DROP COLUMN IF EXISTS "solvedBy",
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS type;

-- Triggers: keep *_updated_at columns fresh on update for expected "updatedAt" semantics.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.request') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='request' AND column_name='updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='request_set_updated_at') THEN
      EXECUTE 'CREATE TRIGGER request_set_updated_at BEFORE UPDATE ON request FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updatedat_timestamp() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.system_config') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='system_config' AND column_name='updatedAt'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='system_config_set_updatedAt') THEN
      EXECUTE 'CREATE TRIGGER system_config_set_updatedAt BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION set_updatedat_timestamp()';
    END IF;
  END IF;
END $$;

-- Add FK for account_meta__individual.roleId -> authz_role.id (added after table exists)
ALTER TABLE IF EXISTS account_meta__individual
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_meta__individual_roleId_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE account_meta__individual ADD CONSTRAINT account_meta__individual_roleId_fkey FOREIGN KEY (\"roleId\") REFERENCES authz_role(id) ON DELETE SET NULL';
  END IF;
END $$;

COMMIT;
