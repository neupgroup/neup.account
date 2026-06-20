export const PERMISSION_SCOPE_OPTIONS = [
  'public',
  'managable',
  'managable.brand',
  'managable.branch',
  'managable.dependent',
  'managable.individual',
  'toApprove',
  'root',
] as const;

export type PermissionScopeOption = (typeof PERMISSION_SCOPE_OPTIONS)[number];

const PERMISSION_SCOPE_SET = new Set<string>(PERMISSION_SCOPE_OPTIONS);

export function isKnownPermissionScope(scope: string): scope is PermissionScopeOption {
  return PERMISSION_SCOPE_SET.has(scope);
}

export function permissionScopeError() {
  return `Permission scope must be one or more of: ${PERMISSION_SCOPE_OPTIONS.join(', ')}.`;
}

function getProgressiveScopeLevel(scope: string): PermissionScopeOption | 'unknown' {
  const normalized = scope.trim();
  if (!normalized) return 'unknown';
  if (normalized === 'root' || normalized === 'individual.root') return 'root';
  if (normalized === 'toApprove' || normalized.endsWith('.toApprove')) return 'toApprove';
  if (normalized === 'managable.brand' || normalized === 'brand.managable') return 'managable.brand';
  if (normalized === 'managable.branch' || normalized === 'branch.brand.managable') return 'managable.branch';
  if (normalized === 'managable.dependent' || normalized === 'dependent.individual.managable') return 'managable.dependent';
  if (normalized === 'managable.individual' || normalized === 'individual.managable') return 'managable.individual';
  if (normalized === 'managable' || normalized.endsWith('.managable')) return 'managable';
  if (normalized === 'public' || normalized.endsWith('.public') || normalized === 'default' || normalized === 'application' || normalized === 'brand') {
    return 'public';
  }
  return 'unknown';
}

export function normalizePermissionScopes(value: unknown): PermissionScopeOption[] {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized: PermissionScopeOption[] = [];
  const seen = new Set<PermissionScopeOption>();

  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string') continue;
    const trimmed = rawValue.trim();
    if (!trimmed) continue;

    const directScope = isKnownPermissionScope(trimmed) ? trimmed : null;
    const progressiveScope = getProgressiveScopeLevel(trimmed);
    const mappedScope = directScope ?? (progressiveScope === 'unknown' ? null : progressiveScope);
    if (!mappedScope || seen.has(mappedScope)) continue;

    seen.add(mappedScope);
    normalized.push(mappedScope);
  }

  return normalized;
}

export function hasUsablePermissionScopes(value: unknown): boolean {
  return normalizePermissionScopes(value).length > 0;
}
