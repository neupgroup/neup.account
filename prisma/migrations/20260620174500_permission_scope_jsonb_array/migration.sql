ALTER TABLE "authz_permission"
  ALTER COLUMN "scope" TYPE jsonb
  USING (
    CASE
      WHEN "scope" IN ('public', 'individual.public', 'brand.public', 'branch.brand.public', 'dependent.individual.public', 'default', 'application', 'brand')
        THEN jsonb_build_array('public')
      WHEN "scope" IN ('managable', 'brand.managable', 'branch.brand.managable', 'individual.managable', 'dependent.individual.managable')
        THEN jsonb_build_array('managable')
      WHEN "scope" IN ('toApprove', 'individual.toApprove', 'dependent.individual.toApprove', 'brand.toApprove', 'branch.brand.toApprove')
        THEN jsonb_build_array('toApprove')
      WHEN "scope" IN ('individual.root', 'root')
        THEN jsonb_build_array('root')
      ELSE jsonb_build_array("scope")
    END
  );
