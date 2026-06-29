UPDATE "account"
SET "accountType" = 'subbrand'
WHERE "accountType" = 'branch';

DO $$
BEGIN
  IF to_regclass('public.account_ownership') IS NOT NULL THEN
    UPDATE "account_ownership"
    SET "type" = 'subbrand'
    WHERE "type" = 'branch';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.contact') IS NOT NULL THEN
    UPDATE "contact"
    SET "contactType" = 'subbrandLocation'
    WHERE "contactType" = 'branchLocation';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.activity') IS NOT NULL THEN
    UPDATE "activity"
    SET "action" = regexp_replace("action", '^account\.branch\.create\(', 'account.subbrand.create(')
    WHERE "action" LIKE 'account.branch.create(%';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.role') IS NOT NULL THEN
    UPDATE "role"
    SET "asset_type" = CASE
      WHEN "asset_type" = 'branch_account' THEN 'subbrand_account'
      WHEN "asset_type" = 'account.branch' THEN 'account.subbrand'
      ELSE "asset_type"
    END
    WHERE "asset_type" IN ('branch_account', 'account.branch');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.authz_assets_access_grant') IS NOT NULL THEN
    UPDATE "authz_assets_access_grant"
    SET "asset_type" = CASE
      WHEN "asset_type" = 'branch_account' THEN 'subbrand_account'
      WHEN "asset_type" = 'account.branch' THEN 'account.subbrand'
      ELSE "asset_type"
    END
    WHERE "asset_type" IN ('branch_account', 'account.branch');
  END IF;
END $$;
