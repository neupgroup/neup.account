-- Update the asset model to the new relationship-based enum values.
-- Existing rows are mapped from the old generic values using their parent columns.

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "is_temporary" TIMESTAMP(3);

ALTER TYPE "asset_type" RENAME TO "asset_type_old";

CREATE TYPE "asset_type" AS ENUM (
  'acc_in_port',
  'acc_in_acc',
  'app_in_port',
  'app_in_acc',
  'port_in_acc',
  'conn_in_acc',
  'conn_in_port'
);

ALTER TABLE "assets"
  ALTER COLUMN "asset_type" TYPE "asset_type"
  USING (
    CASE
      WHEN "asset_portfolio_id" IS NOT NULL THEN 'port_in_acc'::"asset_type"
      WHEN lower(COALESCE("asset_type"::text, '')) = 'application' THEN
        CASE
          WHEN "parent_account_id" IS NOT NULL THEN 'app_in_acc'::"asset_type"
          ELSE 'app_in_port'::"asset_type"
        END
      WHEN lower(COALESCE("asset_type"::text, '')) = 'connection' THEN
        CASE
          WHEN "parent_account_id" IS NOT NULL THEN 'conn_in_acc'::"asset_type"
          ELSE 'conn_in_port'::"asset_type"
        END
      WHEN lower(COALESCE("asset_type"::text, '')) = 'account' THEN
        CASE
          WHEN "parent_account_id" IS NOT NULL THEN 'acc_in_acc'::"asset_type"
          ELSE 'acc_in_port'::"asset_type"
        END
      WHEN "parent_account_id" IS NOT NULL THEN 'acc_in_acc'::"asset_type"
      ELSE 'acc_in_port'::"asset_type"
    END
  );

ALTER TABLE "assets"
  ALTER COLUMN "asset_type" SET NOT NULL;

DROP TYPE "asset_type_old";
