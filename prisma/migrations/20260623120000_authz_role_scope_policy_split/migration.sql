ALTER TABLE "authz_role"
  ADD COLUMN "acquisition_type" TEXT NOT NULL DEFAULT 'assignment',
  ADD COLUMN "approval_policy" TEXT NOT NULL DEFAULT 'none';

UPDATE "authz_role"
SET
  "scope" = CASE
    WHEN "scope" IN ('root', 'individual.root', 'root.individual', 'root.1000', 'root.i1000') THEN 'rootMgmt.self'
    WHEN "scope" IN (
      'public', 'default', 'application', 'managed', 'manageable', 'managable', 'toApprove',
      'public.individual', 'public.dependent',
      'managed.individual', 'managed.dependent',
      'toApprove.individual', 'toApprove.dependent',
      'individual.public', 'dependent.individual.public',
      'individual.managable', 'dependent.individual.managable',
      'individual.toApprove', 'dependent.individual.toApprove',
      'managed.1000', 'managed.0100', 'managed.i1000', 'managed.i0100',
      'managable.i1000', 'managable.i0100',
      'public.1000', 'public.0100', 'public.i1000', 'public.i0100',
      'toApprove.1000', 'toApprove.0100', 'toApprove.i1000', 'toApprove.i0100'
    ) THEN 'acMgmt.self'
    WHEN "scope" IN (
      'brand', 'managed.brand', 'public.brand', 'toApprove.brand',
      'brand.managable', 'brand.public', 'brand.toApprove',
      'managed.0010', 'managed.i0010', 'managable.i0010',
      'public.0010', 'public.i0010',
      'toApprove.0010', 'toApprove.i0010'
    ) THEN 'acMgmt.brand'
    WHEN "scope" IN (
      'managed.branch', 'public.branch', 'toApprove.branch',
      'branch.brand.managable', 'branch.brand.public', 'branch.brand.toApprove',
      'managed.0001', 'managed.i0001', 'managable.i0001',
      'public.0001', 'public.i0001',
      'toApprove.0001', 'toApprove.i0001'
    ) THEN 'acMgmt.branch'
    ELSE "scope"
  END,
  "acquisition_type" = CASE
    WHEN "scope" LIKE 'public%' OR "scope" IN ('public', 'default', 'application', 'brand', 'individual.public', 'brand.public', 'branch.brand.public', 'dependent.individual.public')
      THEN 'public_request'
    WHEN "scope" LIKE 'toApprove%' OR "scope" = 'toApprove' OR "scope" IN ('individual.toApprove', 'brand.toApprove', 'branch.brand.toApprove', 'dependent.individual.toApprove')
      THEN 'public_request'
    ELSE 'assignment'
  END,
  "approval_policy" = CASE
    WHEN "scope" LIKE 'toApprove%' OR "scope" = 'toApprove' OR "scope" IN ('individual.toApprove', 'brand.toApprove', 'branch.brand.toApprove', 'dependent.individual.toApprove')
      THEN 'approval_required'
    ELSE 'none'
  END;

UPDATE "authz_role"
SET "scope" = 'acMgmt.brandBranch'
WHERE "scope" = 'acMgmt.brand'
  AND EXISTS (
    SELECT 1
    FROM "authz_role_permission_map" map
    WHERE map."role_id" = "authz_role"."id"
      AND map."scope" IN ('managed.branch', 'public.branch', 'toApprove.branch', 'branch.brand.managable', 'branch.brand.public', 'branch.brand.toApprove')
  );

UPDATE "authz_role_permission_map"
SET "scope" = CASE
  WHEN "scope" IN ('root', 'individual.root', 'root.individual', 'root.1000', 'root.i1000') THEN 'rootMgmt.self'
  WHEN "scope" IN (
    'public', 'default', 'application', 'managed', 'manageable', 'managable', 'toApprove',
    'public.individual', 'public.dependent',
    'managed.individual', 'managed.dependent',
    'toApprove.individual', 'toApprove.dependent',
    'individual.public', 'dependent.individual.public',
    'individual.managable', 'dependent.individual.managable',
    'individual.toApprove', 'dependent.individual.toApprove',
    'managed.1000', 'managed.0100', 'managed.i1000', 'managed.i0100',
    'managable.i1000', 'managable.i0100',
    'public.1000', 'public.0100', 'public.i1000', 'public.i0100',
    'toApprove.1000', 'toApprove.0100', 'toApprove.i1000', 'toApprove.i0100'
  ) THEN 'acMgmt.self'
  WHEN "scope" IN (
    'brand', 'managed.brand', 'public.brand', 'toApprove.brand',
    'brand.managable', 'brand.public', 'brand.toApprove',
    'managed.0010', 'managed.i0010', 'managable.i0010',
    'public.0010', 'public.i0010',
    'toApprove.0010', 'toApprove.i0010'
  ) THEN 'acMgmt.brand'
  WHEN "scope" IN (
    'managed.branch', 'public.branch', 'toApprove.branch',
    'branch.brand.managable', 'branch.brand.public', 'branch.brand.toApprove',
    'managed.0001', 'managed.i0001', 'managable.i0001',
    'public.0001', 'public.i0001',
    'toApprove.0001', 'toApprove.i0001'
  ) THEN 'acMgmt.branch'
  ELSE "scope"
END;
