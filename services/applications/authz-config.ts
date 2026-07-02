export type ApplicationAuthzDefinitionTuple = [name: string, key: string, description: string];

export type ApplicationAuthzDefinitionOption = {
  name: string;
  key: string;
  description: string;
};

export type ApplicationAuthzConfig = {
  definedScopes: ApplicationAuthzDefinitionTuple[];
  allowMultipleDefinedScopes: boolean;
  applicableForDefinitions: ApplicationAuthzDefinitionTuple[];
};

/**
 * ::neup.documentation::application-authz-config-module
 * ::title Application Authz Config Helpers
 *
 * Normalizes and formats authz configuration stored inside application details.
 *
 * ::public
 *
 * Use this module to read configured application scopes, convert them to UI options, and sanitize persisted authz definition tuples.
 *
 * ::public end
 *
 * ::private
 *
 * Duplicate or malformed definition tuples are filtered out during normalization so config consumers work with a stable shape.
 *
 * ::private end
 *
 * ::end
 */
function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeApplicationAuthzDefinitions(value: unknown): ApplicationAuthzDefinitionTuple[] {
  /**
   * ::neup.documentation::application-authz-config-normalize-definitions
   * ::function normalizeApplicationAuthzDefinitions(value)
   *
   * Normalizes stored authz definition tuples into a validated list.
   *
   * ::public
   *
   * Each valid row contributes a `[name, key, description]` tuple with a unique key.
   *
   * ::public end
   *
   * ::private
   *
   * Rows with missing names, missing keys, or duplicate keys are discarded.
   *
   * ::private end
   *
   * ::end
   */
  if (!Array.isArray(value)) return [];

  const rows: ApplicationAuthzDefinitionTuple[] = [];
  const seenKeys = new Set<string>();

  for (const row of value) {
    if (!Array.isArray(row) || row.length < 2) continue;

    const name = toTrimmedString(row[0]);
    const key = toTrimmedString(row[1]);
    const description = toTrimmedString(row[2]);

    if (!name || !key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    rows.push([name, key, description]);
  }

  return rows;
}

export function toApplicationAuthzDefinitionOptions(
  definitions: ApplicationAuthzDefinitionTuple[],
): ApplicationAuthzDefinitionOption[] {
  return definitions.map(([name, key, description]) => ({ name, key, description }));
}

export function formatApplicationAuthzScopeHint(
  options: ApplicationAuthzDefinitionOption[],
  allowMultiple: boolean,
): string {
  if (options.length === 0) {
    return 'No configured scopes on the application configuration page yet.';
  }

  const configuredScopes = options.map((option) => option.key).join(', ');
  const selectionHint = allowMultiple
    ? 'Multiple configured scopes are allowed.'
    : 'Use one configured scope per permission.';

  return `Configured scopes: ${configuredScopes}. ${selectionHint}`;
}

export function extractApplicationAuthzConfig(details: unknown): ApplicationAuthzConfig {
  /**
   * ::neup.documentation::application-authz-config-extract-config
   * ::function extractApplicationAuthzConfig(details)
   *
   * Extracts the authz configuration subset from an application details payload.
   *
   * ::public
   *
   * The result includes defined scopes, whether multiple configured scopes are allowed, and the applicable-for definitions.
   *
   * ::public end
   *
   * ::private
   *
   * Missing or malformed details fall back to empty normalized configuration arrays.
   *
   * ::private end
   *
   * ::end
   */
  const record = details && typeof details === 'object' ? (details as Record<string, unknown>) : {};

  return {
    definedScopes: normalizeApplicationAuthzDefinitions(record.definedScopes),
    allowMultipleDefinedScopes: Boolean(record.allowMultipleDefinedScopes),
    applicableForDefinitions: normalizeApplicationAuthzDefinitions(record.applicableForDefinitions),
  };
}

export function normalizeConfiguredSelection(
  values: string[] | null | undefined,
  allowedKeys: string[],
  allowMultiple: boolean,
): string[] {
  const allowed = new Set(allowedKeys);
  const selected = Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && allowed.has(value)),
    ),
  );

  if (allowMultiple) return selected;
  return selected.length > 0 ? [selected[0]] : [];
}
