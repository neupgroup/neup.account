UPDATE "account"
SET "accountType" = 'subbrand'
WHERE "accountType" = 'branch';

UPDATE "account_ownership"
SET "type" = 'subbrand'
WHERE "type" = 'branch';

UPDATE "contact"
SET "contactType" = 'subbrandLocation'
WHERE "contactType" = 'branchLocation';

UPDATE "activity"
SET "action" = regexp_replace("action", '^account\.branch\.create\(', 'account.subbrand.create(')
WHERE "action" LIKE 'account.branch.create(%';

UPDATE "role"
SET "asset_type" = CASE
  WHEN "asset_type" = 'branch_account' THEN 'subbrand_account'
  WHEN "asset_type" = 'account.branch' THEN 'account.subbrand'
  ELSE "asset_type"
END
WHERE "asset_type" IN ('branch_account', 'account.branch');

UPDATE "authz_assets_access_grant"
SET "asset_type" = CASE
  WHEN "asset_type" = 'branch_account' THEN 'subbrand_account'
  WHEN "asset_type" = 'account.branch' THEN 'account.subbrand'
  ELSE "asset_type"
END
WHERE "asset_type" IN ('branch_account', 'account.branch');
