ALTER TABLE IF EXISTS "authz_role_capability"
  ADD COLUMN IF NOT EXISTS "scope" TEXT,
  ADD COLUMN IF NOT EXISTS "app_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role_name" TEXT,
  ADD COLUMN IF NOT EXISTS "denormalized_capability" JSONB;
