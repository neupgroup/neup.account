UPDATE "member"
SET
  "member_type" = 'acc_self',
  "child_account_id" = NULL
WHERE
  "member_type" = 'acc_in_acc'
  AND "parent_account_id" IS NOT NULL
  AND "child_account_id" = "parent_account_id";
