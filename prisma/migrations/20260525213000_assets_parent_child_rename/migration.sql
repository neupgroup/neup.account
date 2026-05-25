ALTER TABLE "assets"
  RENAME COLUMN "portfolio_id" TO "parent_portfolio";

ALTER TABLE "assets"
  ALTER COLUMN "parent_portfolio" DROP NOT NULL;

ALTER TABLE "assets"
  ADD COLUMN "parent_account" text;

ALTER TABLE "assets"
  RENAME COLUMN "target_account" TO "child_account";

ALTER TABLE "assets"
  RENAME COLUMN "target_application" TO "child_application";

ALTER TABLE "assets"
  RENAME COLUMN "target_connection" TO "child_connection";

ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "portfolio_assets_portfolioId_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_target_account_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_target_application_fkey";
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_target_connection_fkey";

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_parent_portfolio_fkey"
    FOREIGN KEY ("parent_portfolio") REFERENCES "portfolio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_parent_account_fkey"
    FOREIGN KEY ("parent_account") REFERENCES "account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_child_account_fkey"
    FOREIGN KEY ("child_account") REFERENCES "account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_child_application_fkey"
    FOREIGN KEY ("child_application") REFERENCES "application"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_child_connection_fkey"
    FOREIGN KEY ("child_connection") REFERENCES "connection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "portfolio_assets_portfolioId_idx";
DROP INDEX IF EXISTS "assets_asset_type_target_account_idx";
DROP INDEX IF EXISTS "assets_asset_type_target_application_idx";
DROP INDEX IF EXISTS "assets_asset_type_target_connection_idx";

CREATE INDEX "assets_parent_portfolio_idx" ON "assets" ("parent_portfolio");
CREATE INDEX "assets_parent_account_idx" ON "assets" ("parent_account");
CREATE INDEX "assets_asset_type_child_account_idx" ON "assets" ("asset_type", "child_account");
CREATE INDEX "assets_asset_type_child_application_idx" ON "assets" ("asset_type", "child_application");
CREATE INDEX "assets_asset_type_child_connection_idx" ON "assets" ("asset_type", "child_connection");
