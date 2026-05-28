ALTER TABLE "connection"
  ADD COLUMN IF NOT EXISTS "role_id" TEXT;

ALTER TABLE "connection"
  ADD CONSTRAINT "connection_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "authz_role"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "connection_role_id_idx" ON "connection"("role_id");
