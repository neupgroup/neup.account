-- AlterTable: add status column to portfolio_member
ALTER TABLE "portfolio_member"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- Backfill existing rows (defensive; default already handles this)
UPDATE "portfolio_member"
SET "status" = 'active'
WHERE "status" IS DISTINCT FROM 'active';
