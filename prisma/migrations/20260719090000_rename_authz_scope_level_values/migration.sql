ALTER TABLE "authz_role"
ALTER COLUMN "scope_level" SET DEFAULT 'assignable.byTeam';

UPDATE "authz_role"
SET "scope_level" = CASE "scope_level"
  WHEN 'assignable' THEN 'assignable.byTeam'
  WHEN 'selfAssigned' THEN 'assignable.byTeam'
  WHEN 'publiclyEnrollable' THEN 'assignable.publicly'
  WHEN 'publiclyRequestable' THEN 'assignable.publicly.byRequest'
  WHEN 'requestableToOwner' THEN 'assignable.byTeam.fromRequest'
  WHEN 'requestToOwner' THEN 'assignable.byTeam.fromRequest'
  WHEN 'rootAssigned' THEN 'assignable.byRoot'
  WHEN 'rootManaged' THEN 'assignable.byRoot'
  ELSE "scope_level"
END
WHERE "scope_level" IN (
  'assignable',
  'selfAssigned',
  'publiclyEnrollable',
  'publiclyRequestable',
  'requestableToOwner',
  'requestToOwner',
  'rootAssigned',
  'rootManaged'
);

UPDATE "authz_role_permission_map"
SET "scope_level" = CASE "scope_level"
  WHEN 'assignable' THEN 'assignable.byTeam'
  WHEN 'selfAssigned' THEN 'assignable.byTeam'
  WHEN 'publiclyEnrollable' THEN 'assignable.publicly'
  WHEN 'publiclyRequestable' THEN 'assignable.publicly.byRequest'
  WHEN 'requestableToOwner' THEN 'assignable.byTeam.fromRequest'
  WHEN 'requestToOwner' THEN 'assignable.byTeam.fromRequest'
  WHEN 'rootAssigned' THEN 'assignable.byRoot'
  WHEN 'rootManaged' THEN 'assignable.byRoot'
  ELSE "scope_level"
END
WHERE "scope_level" IN (
  'assignable',
  'selfAssigned',
  'publiclyEnrollable',
  'publiclyRequestable',
  'requestableToOwner',
  'requestToOwner',
  'rootAssigned',
  'rootManaged'
);

UPDATE "authz_permission"
SET "scope_level" = (CASE
  WHEN "scope_level" IS NULL THEN NULL::jsonb
  WHEN jsonb_typeof("scope_level"::jsonb) = 'array' THEN (
    SELECT COALESCE(
      jsonb_agg(
        CASE element #>> '{}'
          WHEN 'assignable' THEN to_jsonb('assignable.byTeam'::text)
          WHEN 'selfAssigned' THEN to_jsonb('assignable.byTeam'::text)
          WHEN 'publiclyEnrollable' THEN to_jsonb('assignable.publicly'::text)
          WHEN 'publiclyRequestable' THEN to_jsonb('assignable.publicly.byRequest'::text)
          WHEN 'requestableToOwner' THEN to_jsonb('assignable.byTeam.fromRequest'::text)
          WHEN 'requestToOwner' THEN to_jsonb('assignable.byTeam.fromRequest'::text)
          WHEN 'rootAssigned' THEN to_jsonb('assignable.byRoot'::text)
          WHEN 'rootManaged' THEN to_jsonb('assignable.byRoot'::text)
          ELSE element
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements("scope_level"::jsonb) AS element
  )
  WHEN jsonb_typeof("scope_level"::jsonb) = 'string' THEN (
    CASE "scope_level" #>> '{}'
      WHEN 'assignable' THEN to_jsonb('assignable.byTeam'::text)
      WHEN 'selfAssigned' THEN to_jsonb('assignable.byTeam'::text)
      WHEN 'publiclyEnrollable' THEN to_jsonb('assignable.publicly'::text)
      WHEN 'publiclyRequestable' THEN to_jsonb('assignable.publicly.byRequest'::text)
      WHEN 'requestableToOwner' THEN to_jsonb('assignable.byTeam.fromRequest'::text)
      WHEN 'requestToOwner' THEN to_jsonb('assignable.byTeam.fromRequest'::text)
      WHEN 'rootAssigned' THEN to_jsonb('assignable.byRoot'::text)
      WHEN 'rootManaged' THEN to_jsonb('assignable.byRoot'::text)
      ELSE "scope_level"::jsonb
    END
  )
  ELSE "scope_level"::jsonb
END)::json
WHERE "scope_level" IS NOT NULL
  AND "scope_level"::jsonb::text ~ 'assignable|selfAssigned|publiclyEnrollable|publiclyRequestable|requestableToOwner|requestToOwner|rootAssigned|rootManaged';
