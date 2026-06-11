ALTER TABLE "member"
  ADD COLUMN IF NOT EXISTS "parent_connection_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_parent_connection_id_fkey'
  ) THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_parent_connection_id_fkey"
      FOREIGN KEY ("parent_connection_id") REFERENCES "connection"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "member_parent_connection_id_idx"
  ON "member"("parent_connection_id");
