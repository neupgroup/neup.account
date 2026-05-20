ALTER TABLE "account"
ADD COLUMN IF NOT EXISTS "linked_account_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_linked_account_id_fkey'
  ) THEN
    ALTER TABLE "account"
    ADD CONSTRAINT "account_linked_account_id_fkey"
    FOREIGN KEY ("linked_account_id") REFERENCES "account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
