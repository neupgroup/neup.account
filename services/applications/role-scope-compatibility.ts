import { normalizePermissionScopes, type PermissionScopeOption } from '@/services/applications/permission-scopes';

export type ProgressiveScopeLevel =
  | 'toApprove'
  | 'managable'
  | 'managable.brand'
  | 'managable.branch'
  | 'managable.dependent'
  | 'managable.individual'
  | 'public'
  | 'root'
  | 'unknown';

function normalizeScope(scope: string | null | undefined): string {
  return (scope ?? '').trim();
}

export function getProgressiveScopeLevel(scope: string | null | undefined): ProgressiveScopeLevel {
  const normalized = normalizeScope(scope);
  if (!normalized) return 'unknown';
  if (normalized === 'root') return 'root';
  if (normalized === 'individual.root') return 'root';
  if (normalized === 'toApprove' || normalized.endsWith('.toApprove')) return 'toApprove';
  if (normalized === 'managable.brand' || normalized === 'brand.managable') return 'managable.brand';
  if (normalized === 'managable.branch' || normalized === 'branch.brand.managable') return 'managable.branch';
  if (normalized === 'managable.dependent' || normalized === 'dependent.individual.managable') return 'managable.dependent';
  if (normalized === 'managable.individual' || normalized === 'individual.managable') return 'managable.individual';
  if (normalized === 'managable' || normalized.endsWith('.managable')) return 'managable';
  if (normalized === 'public' || normalized.endsWith('.public')) return 'public';
  return 'unknown';
}

export function getAllowedPermissionLevelsForRoleScope(scope: string | null | undefined): PermissionScopeOption[] {
  const level = getProgressiveScopeLevel(scope);
  if (level === 'public') return ['public'];
  if (level === 'toApprove') return ['toApprove'];
  if (level === 'managable') return ['managable'];
  if (level === 'managable.brand') return ['managable', 'managable.brand'];
  if (level === 'managable.branch') return ['managable', 'managable.branch'];
  if (level === 'managable.dependent') return ['managable', 'managable.dependent'];
  if (level === 'managable.individual') return ['managable', 'managable.individual'];
  if (level === 'root') return ['root'];
  return [];
}

export function isPermissionScopeAllowedForRoleScope(
  permissionScopes: unknown,
  roleScope: string | null | undefined,
): boolean {
  const allowedLevels = getAllowedPermissionLevelsForRoleScope(roleScope);
  if (allowedLevels.length === 0) return false;

  return normalizePermissionScopes(permissionScopes).some((scope) => allowedLevels.includes(scope));
}

export function getInvalidPermissionScopesForRoleScope(
  permissionScopes: readonly unknown[],
  roleScope: string | null | undefined,
): string[] {
  return permissionScopes
    .map((scope) => normalizePermissionScopes(scope))
    .filter((scope) => scope.length === 0 || !isPermissionScopeAllowedForRoleScope(scope, roleScope))
    .map((scope) => scope.join(', ') || '(missing scope)');
}

export function getRoleScopeCompatibilityError(
  roleScope: string | null | undefined,
  permissionScopes: readonly unknown[],
): string | null {
  const invalidScopes = getInvalidPermissionScopesForRoleScope(permissionScopes, roleScope);
  if (invalidScopes.length === 0) return null;

  const uniqueScopes = Array.from(new Set(invalidScopes));
  return `Role scope "${normalizeScope(roleScope)}" is incompatible with permission scopes: ${uniqueScopes.join(', ')}.`;
}
