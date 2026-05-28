ALTER TABLE "application"
  ADD COLUMN IF NOT EXISTS "def_role_id" TEXT;

ALTER TABLE "application"
  ADD CONSTRAINT "application_def_role_id_fkey"
  FOREIGN KEY ("def_role_id") REFERENCES "authz_role"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "application_def_role_id_idx" ON "application"("def_role_id");
