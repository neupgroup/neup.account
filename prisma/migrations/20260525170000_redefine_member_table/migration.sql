-- Create enums if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemberAccessFor') THEN
    CREATE TYPE "MemberAccessFor" AS ENUM ('account', 'application', 'connection');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemberStatus') THEN
    CREATE TYPE "MemberStatus" AS ENUM ('active', 'paused', 'removed');
  END IF;
END $$;

-- Drop old foreign keys/indexes that reference deprecated columns
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_target_account_id_fkey";
ALTER TABLE "member" DROP CONSTRAINT IF EXISTS "member_target_portfolio_id_fkey";
DROP INDEX IF EXISTS "member_target_account_id_idx";
DROP INDEX IF EXISTS "member_target_portfolio_id_idx";
DROP INDEX IF EXISTS "member_target_type_target_account_id_idx";
DROP INDEX IF EXISTS "member_target_type_target_portfolio_id_idx";

-- Add new columns
ALTER TABLE "member"
  ADD COLUMN IF NOT EXISTS "access_to" TEXT,
  ADD COLUMN IF NOT EXISTS "access_for" "MemberAccessFor",
  ADD COLUMN IF NOT EXISTS "parent_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_application_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_connection_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role_id" TEXT,
  ADD COLUMN IF NOT EXISTS "isPermanent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hasFullAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status_new" "MemberStatus" NOT NULL DEFAULT 'active';

-- Backfill from old structure where possible
UPDATE "member"
SET
  "access_to" = COALESCE("access_to", "target_account_id", "member_id"),
  "access_for" = COALESCE("access_for", CASE WHEN "target_account_id" IS NOT NULL THEN 'account'::"MemberAccessFor" ELSE 'connection'::"MemberAccessFor" END),
  "role_id" = COALESCE("role_id", 'application.owner'),
  "status_new" = CASE
    WHEN LOWER(COALESCE("status", '')) IN ('active', 'paused', 'removed') THEN LOWER("status")::"MemberStatus"
    ELSE 'active'::"MemberStatus"
  END
WHERE "access_to" IS NULL OR "access_for" IS NULL OR "role_id" IS NULL;

-- Ensure required columns are populated
UPDATE "member" SET "access_to" = "member_id" WHERE "access_to" IS NULL;
UPDATE "member" SET "access_for" = 'account'::"MemberAccessFor" WHERE "access_for" IS NULL;
UPDATE "member" SET "role_id" = 'application.owner' WHERE "role_id" IS NULL;

ALTER TABLE "member"
  ALTER COLUMN "access_to" SET NOT NULL,
  ALTER COLUMN "access_for" SET NOT NULL,
  ALTER COLUMN "role_id" SET NOT NULL;

-- Replace old status with enum status
ALTER TABLE "member" DROP COLUMN IF EXISTS "status";
ALTER TABLE "member" RENAME COLUMN "status_new" TO "status";

-- Drop deprecated columns
ALTER TABLE "member"
  DROP COLUMN IF EXISTS "target_type",
  DROP COLUMN IF EXISTS "target_account_id",
  DROP COLUMN IF EXISTS "target_portfolio_id",
  DROP COLUMN IF EXISTS "is_permanent",
  DROP COLUMN IF EXISTS "has_full_access",
  DROP COLUMN IF EXISTS "details";

-- Add requested foreign keys
ALTER TABLE "member" ADD CONSTRAINT "member_access_to_fkey"
  FOREIGN KEY ("access_to") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member" ADD CONSTRAINT "member_parent_account_id_fkey"
  FOREIGN KEY ("parent_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member" ADD CONSTRAINT "member_parent_application_id_fkey"
  FOREIGN KEY ("parent_application_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member" ADD CONSTRAINT "member_parent_connection_id_fkey"
  FOREIGN KEY ("parent_connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member" ADD CONSTRAINT "member_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS "member_access_to_idx" ON "member"("access_to");
CREATE INDEX IF NOT EXISTS "member_access_for_idx" ON "member"("access_for");
CREATE INDEX IF NOT EXISTS "member_parent_account_id_idx" ON "member"("parent_account_id");
CREATE INDEX IF NOT EXISTS "member_parent_application_id_idx" ON "member"("parent_application_id");
CREATE INDEX IF NOT EXISTS "member_parent_connection_id_idx" ON "member"("parent_connection_id");
CREATE INDEX IF NOT EXISTS "member_role_id_idx" ON "member"("role_id");
