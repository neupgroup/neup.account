CREATE TABLE IF NOT EXISTS "resources" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "account_id" TEXT,
  "uploaded_by" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "details" JSONB,
  "uploaded_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "resources_type_idx" ON "resources"("type");
CREATE INDEX IF NOT EXISTS "resources_account_id_idx" ON "resources"("account_id");
CREATE INDEX IF NOT EXISTS "resources_uploaded_by_idx" ON "resources"("uploaded_by");
CREATE INDEX IF NOT EXISTS "resources_uploaded_on_idx" ON "resources"("uploaded_on");

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
