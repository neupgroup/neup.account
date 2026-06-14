-- Finalize the access table shape requested by the app.

ALTER TABLE "assets" RENAME TO "access";

ALTER TABLE "access" RENAME COLUMN "asset_type" TO "access_type";
ALTER TABLE "access" RENAME COLUMN "asset_account_id" TO "member_account_id";
ALTER TABLE "access" RENAME COLUMN "asset_connection_id" TO "member_connection_id";
ALTER TABLE "access" RENAME COLUMN "asset_portfolio_id" TO "member_portfolio_id";
ALTER TABLE "access" RENAME COLUMN "asset_application_id" TO "access_application_id";

ALTER TABLE "access"
  ADD COLUMN IF NOT EXISTS "member_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_connection_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_temporary" TIMESTAMP(3);

UPDATE "access"
SET "member_id" = COALESCE(
  "member_id",
  "member_account_id",
  "member_connection_id",
  "member_portfolio_id",
  "access_application_id"
);

ALTER TABLE "access"
  DROP COLUMN IF EXISTS "asset_other_id",
  DROP COLUMN IF EXISTS "is_main_owner";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_parent_connection_id_fkey') THEN
    ALTER TABLE "access"
      ADD CONSTRAINT "access_parent_connection_id_fkey"
      FOREIGN KEY ("parent_connection_id") REFERENCES "connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
