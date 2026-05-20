-- Baseline creates `assets_access_grant` (not `authz_assets_access_grant`).
-- Keep this migration resilient across environments.
ALTER TABLE IF EXISTS "assets_access_grant"
ADD COLUMN IF NOT EXISTS "asset_type" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "assets_access_grant_asset_type_idx"
ON "assets_access_grant"("asset_type");
