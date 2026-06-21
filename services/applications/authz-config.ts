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

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeApplicationAuthzDefinitions(value: unknown): ApplicationAuthzDefinitionTuple[] {
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

export function extractApplicationAuthzConfig(details: unknown): ApplicationAuthzConfig {
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
