-- Fix divergences:
-- - auth_request -> authn_request (and ensure id default)
-- - auth_session -> authn_session (and ensure id default)
-- - activity: rename memberId/actorAccountId -> target_account_id/actor_account_id, set id default
-- - notification: add detail, rename columns to snake_case, drop requestId (store metadata in detail), set id default
-- - request: rename columns to snake_case, set id default

BEGIN;

-- auth_request -> authn_request
DO $$
BEGIN
  IF to_regclass('public.auth_request') IS NOT NULL AND to_regclass('public.authn_request') IS NULL THEN
    EXECUTE 'ALTER TABLE auth_request RENAME TO authn_request';
  END IF;
END $$;
ALTER TABLE IF EXISTS authn_request ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

-- auth_session -> authn_session
DO $$
BEGIN
  IF to_regclass('public.auth_session') IS NOT NULL AND to_regclass('public.authn_session') IS NULL THEN
    EXECUTE 'ALTER TABLE auth_session RENAME TO authn_session';
  END IF;
END $$;
ALTER TABLE IF EXISTS authn_session ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

-- activity columns + default
ALTER TABLE IF EXISTS activity ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='activity' AND column_name='memberId') THEN
    EXECUTE 'ALTER TABLE activity RENAME COLUMN \"memberId\" TO target_account_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='activity' AND column_name='actorAccountId') THEN
    EXECUTE 'ALTER TABLE activity RENAME COLUMN \"actorAccountId\" TO actor_account_id';
  END IF;
END $$;

-- notification: add detail, rename columns, drop requestId
ALTER TABLE IF EXISTS notification
  ADD COLUMN IF NOT EXISTS detail jsonb;

-- best-effort: persist existing requestId into detail, then drop the column
UPDATE notification
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('request_id', "requestId"))
WHERE "requestId" IS NOT NULL;

ALTER TABLE IF EXISTS notification DROP CONSTRAINT IF EXISTS notifications_requestId_fkey;
ALTER TABLE IF EXISTS notification DROP COLUMN IF EXISTS "requestId";

ALTER TABLE IF EXISTS notification ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);

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

-- request: rename columns
ALTER TABLE IF EXISTS request ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
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

COMMIT;

