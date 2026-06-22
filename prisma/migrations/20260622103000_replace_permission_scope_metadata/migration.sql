ALTER TABLE "authz_permission"
ADD COLUMN "scope_v2" JSONB,
ADD COLUMN "rules" TEXT,
ADD COLUMN "status" TEXT;

UPDATE "authz_permission"
SET "scope_v2" = CASE
  WHEN jsonb_typeof("perm_scope") = 'array' AND jsonb_array_length("perm_scope") = 1
    THEN to_jsonb("perm_scope" ->> 0)
  WHEN jsonb_typeof("perm_scope") = 'array' AND jsonb_array_length("perm_scope") > 1
    THEN "perm_scope"
  ELSE NULL
END;

ALTER TABLE "authz_permission" DROP COLUMN "scope";
ALTER TABLE "authz_permission" RENAME COLUMN "scope_v2" TO "scope";
ALTER TABLE "authz_permission" DROP COLUMN "perm_scope";
ALTER TABLE "authz_permission" DROP COLUMN "perm_applicable_for";

UPDATE "authz_permission"
SET "scope" = CASE
  WHEN "scope" IS NULL THEN NULL
  WHEN jsonb_typeof("scope") = 'string' THEN
    CASE
      WHEN trim(both '"' from "scope"::text) ~ '^[\[{].*[\]}]$'
        THEN (trim(both '"' from "scope"::text))::jsonb
      WHEN trim(both '"' from "scope"::text) IN ('true', 'false')
        THEN (trim(both '"' from "scope"::text))::jsonb
      WHEN trim(both '"' from "scope"::text) ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (trim(both '"' from "scope"::text))::jsonb
      WHEN trim(both '"' from "scope"::text) = 'null'
        THEN 'null'::jsonb
      ELSE "scope"
    END
  ELSE "scope"
END;
