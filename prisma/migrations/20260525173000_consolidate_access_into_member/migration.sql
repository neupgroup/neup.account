ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "parent_portfolio_id" TEXT;

-- Ensure a fallback role exists for migrated portfolio_member rows
INSERT INTO "authz_role" ("id", "name", "description", "scope", "pushed")
SELECT 'member.portfolio', 'member.portfolio', 'Migrated portfolio member role', NULL, false
WHERE NOT EXISTS (SELECT 1 FROM "authz_role" WHERE "id" = 'member.portfolio');

-- Migrate account/portfolio grants from authz_account_access_grant
INSERT INTO "member" (
  "id", "member_id", "access_to", "access_for", "parent_application_id", "parent_portfolio_id",
  "role_id", "isPermanent", "hasFullAccess", "status"
)
SELECT
  gen_random_uuid()::text,
  g."target_account_id",
  g."owner_account_id",
  CASE WHEN g."portfolio_id" IS NOT NULL THEN 'portfolio'::"MemberAccessFor" ELSE 'account'::"MemberAccessFor" END,
  g."app_id",
  g."portfolio_id",
  g."role_id",
  false,
  false,
  CASE
    WHEN g."status"::text = 'active' THEN 'active'::"MemberStatus"
    WHEN g."status"::text IN ('invited', 'on_hold') THEN 'paused'::"MemberStatus"
    ELSE 'removed'::"MemberStatus"
  END
FROM "authz_account_access_grant" g;

-- Migrate application ownership/permissions from authz_app_access_grant
INSERT INTO "member" (
  "id", "member_id", "access_to", "access_for", "parent_application_id", "parent_portfolio_id",
  "role_id", "isPermanent", "hasFullAccess", "status"
)
SELECT
  gen_random_uuid()::text,
  g."target_account_id",
  g."account_id",
  'application'::"MemberAccessFor",
  g."app_id",
  g."portfolio_id",
  g."role_id",
  false,
  false,
  CASE
    WHEN g."status"::text = 'active' THEN 'active'::"MemberStatus"
    WHEN g."status"::text IN ('invited', 'on_hold') THEN 'paused'::"MemberStatus"
    ELSE 'removed'::"MemberStatus"
  END
FROM "authz_app_access_grant" g;

-- Migrate portfolio memberships
INSERT INTO "member" (
  "id", "member_id", "access_to", "access_for", "parent_portfolio_id",
  "role_id", "isPermanent", "hasFullAccess", "status"
)
SELECT
  gen_random_uuid()::text,
  pm."accountId",
  pm."accountId",
  'portfolio'::"MemberAccessFor",
  pm."parentPortfolioId",
  'member.portfolio',
  COALESCE(pm."isPermanent", false),
  COALESCE(pm."hasFullAccess", false),
  CASE
    WHEN LOWER(COALESCE(pm."status", 'active')) = 'active' THEN 'active'::"MemberStatus"
    WHEN LOWER(COALESCE(pm."status", 'active')) IN ('paused', 'invited', 'on_hold') THEN 'paused'::"MemberStatus"
    ELSE 'removed'::"MemberStatus"
  END
FROM "portfolio_member" pm;

-- Add portfolio parent FK + index for the unified model
ALTER TABLE "member"
  ADD CONSTRAINT "member_parent_portfolio_id_fkey"
  FOREIGN KEY ("parent_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "member_parent_portfolio_id_idx" ON "member"("parent_portfolio_id");

-- Drop legacy access tables now unified into member
DROP TABLE IF EXISTS "member_access";
DROP TABLE IF EXISTS "authz_account_access_grant";
DROP TABLE IF EXISTS "authz_app_access_grant";
DROP TABLE IF EXISTS "portfolio_member";
