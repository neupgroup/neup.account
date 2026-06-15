-- Align member, assets, and access with access.guide.md.
-- The previous migration renamed the asset table to "access"; those rows are
-- asset ownership rows, so move them back to "assets" and create a dedicated
-- denormalized "access" grant table.

DO $$
BEGIN
  IF to_regclass('public.assets') IS NULL AND to_regclass('public.access') IS NOT NULL THEN
    ALTER TABLE "access" RENAME TO "assets";
  END IF;
END $$;

ALTER TABLE "member"
  ADD COLUMN IF NOT EXISTS "child_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_temporary" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member' AND column_name = 'member_account_id') THEN
    UPDATE "member"
    SET "child_account_id" = COALESCE("child_account_id", "member_account_id");
  END IF;
END $$;

UPDATE "member"
SET "member_type" = CASE
  WHEN "parent_portfolio_id" IS NOT NULL THEN 'acc_in_port'
  ELSE 'acc_in_acc'
END
WHERE "member_type" = 'account';

ALTER TABLE "member"
  DROP CONSTRAINT IF EXISTS "member_member_account_id_fkey",
  DROP CONSTRAINT IF EXISTS "member_member_connection_id_fkey",
  DROP CONSTRAINT IF EXISTS "member_parent_connection_id_fkey";

ALTER TABLE "member"
  DROP COLUMN IF EXISTS "member_account_id",
  DROP COLUMN IF EXISTS "member_connection_id",
  DROP COLUMN IF EXISTS "parent_type",
  DROP COLUMN IF EXISTS "parent_connection_id",
  DROP COLUMN IF EXISTS "is_permanent",
  DROP COLUMN IF EXISTS "access_level";

ALTER TABLE "member"
  ALTER COLUMN "member_type" SET NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT,
  ALTER COLUMN "status" SET DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_child_account_id_fkey') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_child_account_id_fkey"
      FOREIGN KEY ("child_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "member_child_account_id_idx" ON "member"("child_account_id");
CREATE INDEX IF NOT EXISTS "member_is_temporary_idx" ON "member"("is_temporary");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'access_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'type') THEN
    ALTER TABLE "assets" RENAME COLUMN "access_type" TO "type";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'member_account_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'child_account_id') THEN
    ALTER TABLE "assets" RENAME COLUMN "member_account_id" TO "child_account_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'member_connection_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'child_connection_id') THEN
    ALTER TABLE "assets" RENAME COLUMN "member_connection_id" TO "child_connection_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'member_portfolio_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'child_portfolio_id') THEN
    ALTER TABLE "assets" RENAME COLUMN "member_portfolio_id" TO "child_portfolio_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'access_application_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'child_application_id') THEN
    ALTER TABLE "assets" RENAME COLUMN "access_application_id" TO "child_application_id";
  END IF;
END $$;

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "type" "asset_type",
  ADD COLUMN IF NOT EXISTS "child_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "child_portfolio_id" TEXT,
  ADD COLUMN IF NOT EXISTS "child_connection_id" TEXT,
  ADD COLUMN IF NOT EXISTS "child_application_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_portfolio_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_temporary" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

UPDATE "assets"
SET "type" = CASE
  WHEN "parent_portfolio_id" IS NOT NULL AND "child_account_id" IS NOT NULL THEN 'acc_in_port'::"asset_type"
  WHEN "parent_portfolio_id" IS NOT NULL AND "child_connection_id" IS NOT NULL THEN 'conn_in_port'::"asset_type"
  WHEN "parent_portfolio_id" IS NOT NULL AND "child_application_id" IS NOT NULL THEN 'app_in_port'::"asset_type"
  WHEN "parent_account_id" IS NOT NULL AND "child_account_id" IS NOT NULL THEN 'acc_in_acc'::"asset_type"
  WHEN "parent_account_id" IS NOT NULL AND "child_connection_id" IS NOT NULL THEN 'conn_in_acc'::"asset_type"
  WHEN "parent_account_id" IS NOT NULL AND "child_application_id" IS NOT NULL THEN 'app_in_acc'::"asset_type"
  WHEN "parent_account_id" IS NOT NULL AND "child_portfolio_id" IS NOT NULL THEN 'port_in_acc'::"asset_type"
  ELSE 'app_in_acc'::"asset_type"
END
WHERE "type" IS NULL;

ALTER TABLE "assets" ALTER COLUMN "type" SET NOT NULL;

ALTER TABLE "assets"
  DROP CONSTRAINT IF EXISTS "assets_member_account_id_fkey",
  DROP CONSTRAINT IF EXISTS "assets_member_connection_id_fkey",
  DROP CONSTRAINT IF EXISTS "assets_member_portfolio_id_fkey",
  DROP CONSTRAINT IF EXISTS "assets_access_application_id_fkey",
  DROP CONSTRAINT IF EXISTS "assets_parent_connection_id_fkey",
  DROP COLUMN IF EXISTS "member_id",
  DROP COLUMN IF EXISTS "parent_connection_id";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_child_account_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_child_account_id_fkey"
      FOREIGN KEY ("child_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_child_portfolio_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_child_portfolio_id_fkey"
      FOREIGN KEY ("child_portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_child_connection_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_child_connection_id_fkey"
      FOREIGN KEY ("child_connection_id") REFERENCES "connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_child_application_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_child_application_id_fkey"
      FOREIGN KEY ("child_application_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_parent_account_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_parent_account_id_fkey"
      FOREIGN KEY ("parent_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_parent_portfolio_id_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_parent_portfolio_id_fkey"
      FOREIGN KEY ("parent_portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "assets_type_child_account_id_idx" ON "assets"("type", "child_account_id");
CREATE INDEX IF NOT EXISTS "assets_type_child_application_id_idx" ON "assets"("type", "child_application_id");
CREATE INDEX IF NOT EXISTS "assets_type_child_connection_id_idx" ON "assets"("type", "child_connection_id");
CREATE INDEX IF NOT EXISTS "assets_type_child_portfolio_id_idx" ON "assets"("type", "child_portfolio_id");
CREATE INDEX IF NOT EXISTS "assets_parent_account_id_idx" ON "assets"("parent_account_id");
CREATE INDEX IF NOT EXISTS "assets_parent_portfolio_id_idx" ON "assets"("parent_portfolio_id");
CREATE INDEX IF NOT EXISTS "assets_is_temporary_idx" ON "assets"("is_temporary");

CREATE TABLE IF NOT EXISTS "access" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "access_type" "asset_type" NOT NULL,
  "member_id" TEXT NOT NULL,
  "member_account_id" TEXT,
  "parent_account_id" TEXT,
  "parent_portfolio_id" TEXT,
  "asset_id" TEXT NOT NULL,
  "asset_account_id" TEXT,
  "asset_connection_id" TEXT,
  "asset_portfolio_id" TEXT,
  "asset_application_id" TEXT,
  "access_application_id" TEXT,
  "is_temporary" TIMESTAMP(3),
  "role_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "details" JSONB,
  CONSTRAINT "access_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_member_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_member_account_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_member_account_id_fkey" FOREIGN KEY ("member_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_parent_account_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_parent_portfolio_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_parent_portfolio_id_fkey" FOREIGN KEY ("parent_portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_asset_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_asset_account_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_asset_connection_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_asset_connection_id_fkey" FOREIGN KEY ("asset_connection_id") REFERENCES "connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_asset_portfolio_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_asset_portfolio_id_fkey" FOREIGN KEY ("asset_portfolio_id") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_asset_application_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_asset_application_id_fkey" FOREIGN KEY ("asset_application_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_access_application_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_access_application_id_fkey" FOREIGN KEY ("access_application_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_role_id_fkey') THEN
    ALTER TABLE "access" ADD CONSTRAINT "access_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "access_member_id_idx" ON "access"("member_id");
CREATE INDEX IF NOT EXISTS "access_member_account_id_idx" ON "access"("member_account_id");
CREATE INDEX IF NOT EXISTS "access_parent_account_id_idx" ON "access"("parent_account_id");
CREATE INDEX IF NOT EXISTS "access_parent_portfolio_id_idx" ON "access"("parent_portfolio_id");
CREATE INDEX IF NOT EXISTS "access_asset_id_idx" ON "access"("asset_id");
CREATE INDEX IF NOT EXISTS "access_asset_account_id_idx" ON "access"("asset_account_id");
CREATE INDEX IF NOT EXISTS "access_asset_connection_id_idx" ON "access"("asset_connection_id");
CREATE INDEX IF NOT EXISTS "access_asset_portfolio_id_idx" ON "access"("asset_portfolio_id");
CREATE INDEX IF NOT EXISTS "access_asset_application_id_idx" ON "access"("asset_application_id");
CREATE INDEX IF NOT EXISTS "access_access_application_id_idx" ON "access"("access_application_id");
CREATE INDEX IF NOT EXISTS "access_role_id_idx" ON "access"("role_id");
CREATE INDEX IF NOT EXISTS "access_status_idx" ON "access"("status");
CREATE INDEX IF NOT EXISTS "access_is_temporary_idx" ON "access"("is_temporary");

INSERT INTO "access" (
  "access_type",
  "member_id",
  "member_account_id",
  "parent_account_id",
  "parent_portfolio_id",
  "asset_id",
  "asset_account_id",
  "asset_connection_id",
  "asset_portfolio_id",
  "asset_application_id",
  "access_application_id",
  "role_id",
  "status",
  "details"
)
SELECT
  COALESCE(a."type", 'app_in_acc'::"asset_type"),
  m."id",
  m."child_account_id",
  m."parent_account_id",
  m."parent_portfolio_id",
  a."id",
  a."child_account_id",
  a."child_connection_id",
  a."child_portfolio_id",
  a."child_application_id",
  CASE
    WHEN a."child_connection_id" IS NOT NULL THEN c."app_id"
    ELSE a."child_application_id"
  END,
  r."role_id",
  COALESCE(r."status", 'active'),
  jsonb_build_object('migrated_from', 'role')
FROM "role" r
JOIN "member" m ON m."id" = r."member_id"
JOIN "assets" a ON a."id" = r."asset_id"
LEFT JOIN "connection" c ON c."id" = a."child_connection_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "access" existing
  WHERE existing."member_id" = m."id"
    AND existing."asset_id" = a."id"
    AND existing."role_id" = r."role_id"
);
