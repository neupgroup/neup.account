DO $$
BEGIN
  IF to_regclass('public.authz_role_capability') IS NULL
     AND to_regclass('public.authz_role_capability_map') IS NOT NULL THEN
    ALTER TABLE "authz_role_capability_map" RENAME TO "authz_role_capability";
  END IF;
END
$$;
