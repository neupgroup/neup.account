DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
    CREATE TYPE asset_type AS ENUM ('account', 'application', 'connection');
  END IF;
END $$;

ALTER TABLE "assets"
  RENAME COLUMN "portfolioId" TO "portfolio_id";

ALTER TABLE "assets"
  ADD COLUMN "asset_type" asset_type,
  ADD COLUMN "target_account" text,
  ADD COLUMN "target_application" text,
  ADD COLUMN "target_connection" text;

UPDATE "assets"
SET
  "asset_type" = CASE
    WHEN lower(trim("assetType")) IN ('application', 'app') THEN 'application'::asset_type
    WHEN lower(trim("assetType")) = 'connection' THEN 'connection'::asset_type
    ELSE 'account'::asset_type
  END,
  "target_account" = CASE
    WHEN lower(trim("assetType")) IN ('application', 'app', 'connection') THEN NULL
    ELSE "assetId"
  END,
  "target_application" = CASE
    WHEN lower(trim("assetType")) IN ('application', 'app') THEN "assetId"
    ELSE NULL
  END,
  "target_connection" = CASE
    WHEN lower(trim("assetType")) = 'connection' THEN "assetId"
    ELSE NULL
  END;

ALTER TABLE "assets"
  ALTER COLUMN "asset_type" SET NOT NULL;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_target_account_fkey"
    FOREIGN KEY ("target_account") REFERENCES "account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_target_application_fkey"
    FOREIGN KEY ("target_application") REFERENCES "application"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_target_connection_fkey"
    FOREIGN KEY ("target_connection") REFERENCES "connection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "portfolio_assets_assetType_assetId_idx";
CREATE INDEX "assets_asset_type_target_account_idx" ON "assets"("asset_type", "target_account");
CREATE INDEX "assets_asset_type_target_application_idx" ON "assets"("asset_type", "target_application");
CREATE INDEX "assets_asset_type_target_connection_idx" ON "assets"("asset_type", "target_connection");

ALTER TABLE "assets"
  DROP COLUMN "assetType",
  DROP COLUMN "assetId";
