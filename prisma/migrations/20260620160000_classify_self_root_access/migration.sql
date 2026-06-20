-- Access grants need grant-specific values that are separate from asset
-- relationship types. Self grants are classified by the assigned role scope.

CREATE TYPE "access_type" AS ENUM (
  'acc_self',
  'acc_self.root',
  'acc_in_port',
  'acc_in_acc',
  'app_in_port',
  'app_in_acc',
  'port_in_acc',
  'conn_in_acc',
  'conn_in_port'
);

ALTER TABLE "access"
  ADD COLUMN "access_type_next" "access_type";

UPDATE "access" a
SET "access_type_next" = (
  CASE
    WHEN (
      m."member_type" = 'acc_self'
      OR (
        a."parent_account_id" IS NOT NULL
        AND a."member_account_id" = a."parent_account_id"
      )
    ) AND lower(COALESCE(r."scope", '')) IN ('individual.root', 'root')
      THEN 'acc_self.root'
    WHEN (
      m."member_type" = 'acc_self'
      OR (
        a."parent_account_id" IS NOT NULL
        AND a."member_account_id" = a."parent_account_id"
      )
    )
      THEN 'acc_self'
    ELSE a."access_type"::TEXT
  END
)::"access_type"
FROM "member" m, "authz_role" r
WHERE m."id" = a."member_id"
  AND r."id" = a."role_id";

ALTER TABLE "access"
  ALTER COLUMN "access_type_next" SET NOT NULL,
  DROP COLUMN "access_type";

ALTER TABLE "access"
  RENAME COLUMN "access_type_next" TO "access_type";

CREATE INDEX "access_access_type_idx" ON "access"("access_type");
