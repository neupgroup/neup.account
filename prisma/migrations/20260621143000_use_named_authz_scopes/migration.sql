CREATE OR REPLACE FUNCTION public.normalize_authz_scope_values(input_scope TEXT)
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE btrim(COALESCE(input_scope, ''))
    WHEN '' THEN ARRAY[]::TEXT[]
    WHEN 'root' THEN ARRAY['root.individual']
    WHEN 'individual.root' THEN ARRAY['root.individual']
    WHEN 'public' THEN ARRAY['public.individual', 'public.dependent', 'public.brand', 'public.branch']
    WHEN 'default' THEN ARRAY['public.individual']
    WHEN 'application' THEN ARRAY['public.individual', 'public.dependent', 'public.brand', 'public.branch']
    WHEN 'brand' THEN ARRAY['managed.brand']
    WHEN 'managed' THEN ARRAY['managed.individual', 'managed.dependent', 'managed.brand', 'managed.branch']
    WHEN 'manageable' THEN ARRAY['managed.individual', 'managed.dependent', 'managed.brand', 'managed.branch']
    WHEN 'managable' THEN ARRAY['managed.individual', 'managed.dependent', 'managed.brand', 'managed.branch']
    WHEN 'toApprove' THEN ARRAY['toApprove.individual', 'toApprove.dependent', 'toApprove.brand', 'toApprove.branch']
    WHEN 'brand.managable' THEN ARRAY['managed.brand']
    WHEN 'branch.brand.managable' THEN ARRAY['managed.branch']
    WHEN 'individual.managable' THEN ARRAY['managed.individual']
    WHEN 'dependent.individual.managable' THEN ARRAY['managed.dependent']
    WHEN 'individual.public' THEN ARRAY['public.individual']
    WHEN 'brand.public' THEN ARRAY['public.brand']
    WHEN 'branch.brand.public' THEN ARRAY['public.branch']
    WHEN 'dependent.individual.public' THEN ARRAY['public.dependent']
    WHEN 'individual.toApprove' THEN ARRAY['toApprove.individual']
    WHEN 'dependent.individual.toApprove' THEN ARRAY['toApprove.dependent']
    WHEN 'brand.toApprove' THEN ARRAY['toApprove.brand']
    WHEN 'branch.brand.toApprove' THEN ARRAY['toApprove.branch']
    WHEN 'managed.1000' THEN ARRAY['managed.individual']
    WHEN 'managed.0100' THEN ARRAY['managed.dependent']
    WHEN 'managed.0010' THEN ARRAY['managed.brand']
    WHEN 'managed.0001' THEN ARRAY['managed.branch']
    WHEN 'public.1000' THEN ARRAY['public.individual']
    WHEN 'public.0100' THEN ARRAY['public.dependent']
    WHEN 'public.0010' THEN ARRAY['public.brand']
    WHEN 'public.0001' THEN ARRAY['public.branch']
    WHEN 'toApprove.1000' THEN ARRAY['toApprove.individual']
    WHEN 'toApprove.0100' THEN ARRAY['toApprove.dependent']
    WHEN 'toApprove.0010' THEN ARRAY['toApprove.brand']
    WHEN 'toApprove.0001' THEN ARRAY['toApprove.branch']
    WHEN 'root.1000' THEN ARRAY['root.individual']
    WHEN 'managed.i1000' THEN ARRAY['managed.individual']
    WHEN 'managed.i0100' THEN ARRAY['managed.dependent']
    WHEN 'managed.i0010' THEN ARRAY['managed.brand']
    WHEN 'managed.i0001' THEN ARRAY['managed.branch']
    WHEN 'managable.i1000' THEN ARRAY['managed.individual']
    WHEN 'managable.i0100' THEN ARRAY['managed.dependent']
    WHEN 'managable.i0010' THEN ARRAY['managed.brand']
    WHEN 'managable.i0001' THEN ARRAY['managed.branch']
    WHEN 'public.i1000' THEN ARRAY['public.individual']
    WHEN 'public.i0100' THEN ARRAY['public.dependent']
    WHEN 'public.i0010' THEN ARRAY['public.brand']
    WHEN 'public.i0001' THEN ARRAY['public.branch']
    WHEN 'toApprove.i1000' THEN ARRAY['toApprove.individual']
    WHEN 'toApprove.i0100' THEN ARRAY['toApprove.dependent']
    WHEN 'toApprove.i0010' THEN ARRAY['toApprove.brand']
    WHEN 'toApprove.i0001' THEN ARRAY['toApprove.branch']
    WHEN 'root.i1000' THEN ARRAY['root.individual']
    WHEN 'managed.individual' THEN ARRAY['managed.individual']
    WHEN 'managed.dependent' THEN ARRAY['managed.dependent']
    WHEN 'managed.brand' THEN ARRAY['managed.brand']
    WHEN 'managed.branch' THEN ARRAY['managed.branch']
    WHEN 'public.individual' THEN ARRAY['public.individual']
    WHEN 'public.dependent' THEN ARRAY['public.dependent']
    WHEN 'public.brand' THEN ARRAY['public.brand']
    WHEN 'public.branch' THEN ARRAY['public.branch']
    WHEN 'toApprove.individual' THEN ARRAY['toApprove.individual']
    WHEN 'toApprove.dependent' THEN ARRAY['toApprove.dependent']
    WHEN 'toApprove.brand' THEN ARRAY['toApprove.brand']
    WHEN 'toApprove.branch' THEN ARRAY['toApprove.branch']
    WHEN 'root.individual' THEN ARRAY['root.individual']
    ELSE ARRAY[btrim(input_scope)]
  END;
$$;

UPDATE "authz_role"
SET "scope" = (public.normalize_authz_scope_values("scope"))[1]
WHERE COALESCE((public.normalize_authz_scope_values("scope"))[1], '') <> COALESCE("scope", '');

UPDATE "authz_role_permission_map"
SET "scope" = (public.normalize_authz_scope_values("scope"))[1]
WHERE COALESCE((public.normalize_authz_scope_values("scope"))[1], '') <> COALESCE("scope", '');

UPDATE "authz_permission" AS permission
SET "scope" = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(dedup.scope_value) ORDER BY dedup.first_input_order, dedup.first_expanded_order)
    FROM (
      SELECT
        expanded.scope_value,
        MIN(raw.input_order) AS first_input_order,
        MIN(expanded.expanded_order) AS first_expanded_order
      FROM (
        SELECT
          value,
          ordinality AS input_order
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(permission."scope") = 'array' THEN permission."scope"
            WHEN jsonb_typeof(permission."scope") = 'string'
              THEN jsonb_build_array(trim(both '"' FROM permission."scope"::TEXT))
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY
      ) AS raw
      CROSS JOIN LATERAL unnest(public.normalize_authz_scope_values(raw.value)) WITH ORDINALITY AS expanded(scope_value, expanded_order)
      GROUP BY expanded.scope_value
    ) AS dedup
  ),
  '[]'::jsonb
)
WHERE permission."scope" IS NOT NULL;

DROP FUNCTION public.normalize_authz_scope_values(TEXT);
