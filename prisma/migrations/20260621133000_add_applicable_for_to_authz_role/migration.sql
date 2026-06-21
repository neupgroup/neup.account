ALTER TABLE "authz_role"
  ADD COLUMN IF NOT EXISTS "applicable_for" JSONB NOT NULL DEFAULT '[]'::jsonb;
