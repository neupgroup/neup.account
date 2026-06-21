ALTER TABLE "authz_permission"
ADD COLUMN "perm_scope" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "perm_applicable_for" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "authz_permission"
SET "perm_scope" = CASE
  WHEN jsonb_typeof("tag") = 'object' AND jsonb_typeof("tag" -> 'definedScopeKeys') = 'array'
    THEN "tag" -> 'definedScopeKeys'
  ELSE '[]'::jsonb
END
WHERE "perm_scope" = '[]'::jsonb;
