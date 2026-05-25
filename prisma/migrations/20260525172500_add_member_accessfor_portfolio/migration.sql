DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'MemberAccessFor' AND e.enumlabel = 'portfolio'
  ) THEN
    ALTER TYPE "MemberAccessFor" ADD VALUE 'portfolio';
  END IF;
END $$;
