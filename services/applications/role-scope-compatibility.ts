import { normalizePermissionScopes, type PermissionScopeOption } from '@/services/applications/permission-scopes';
import { decodeRoleScope, normalizeRoleScopes, scopeCoversRoleScope } from '@/services/role-scopes';

export type ProgressiveScopeLevel = 'acMgmt' | 'rootMgmt' | 'unknown';

function normalizeScope(scope: unknown): string {
  const normalized = normalizeRoleScopes(scope);
  if (normalized.length > 0) return normalized.join(', ');
  return typeof scope === 'string' ? scope.trim() : '';
}

export function getProgressiveScopeLevel(scope: unknown): ProgressiveScopeLevel {
  const normalized = normalizeRoleScopes(scope);
  const decoded = normalized.map((item) => decodeRoleScope(item)?.mode ?? 'unknown');
  if (decoded.includes('rootMgmt')) return 'rootMgmt';
  if (decoded.includes('acMgmt')) return 'acMgmt';
  return 'unknown';
}

export function getAllowedPermissionLevelsForRoleScope(
  scope: unknown,
): PermissionScopeOption[] {
  return normalizeRoleScopes(scope);
}

export function isPermissionScopeAllowedForRoleScope(
  permissionScopes: unknown,
  roleScope: unknown,
): boolean {
  const normalizedRoleScopes = normalizeRoleScopes(roleScope);
  if (normalizedRoleScopes.length === 0) return false;

  return normalizePermissionScopes(permissionScopes).some((scope) =>
    scopeCoversRoleScope(scope, normalizedRoleScopes),
  );
}

export function getInvalidPermissionScopesForRoleScope(
  permissionScopes: readonly unknown[],
  roleScope: unknown,
): string[] {
  return permissionScopes
    .map((scope) => normalizePermissionScopes(scope))
    .filter((scope) => scope.length === 0 || !isPermissionScopeAllowedForRoleScope(scope, roleScope))
    .map((scope) => scope.join(', ') || '(missing scope)');
}

export function getRoleScopeCompatibilityError(
  roleScope: unknown,
  permissionScopes: readonly unknown[],
): string | null {
  const invalidScopes = getInvalidPermissionScopesForRoleScope(permissionScopes, roleScope);
  if (invalidScopes.length === 0) return null;

  const uniqueScopes = Array.from(new Set(invalidScopes));
  return `Role scope "${normalizeScope(roleScope)}" is incompatible with permission scopes: ${uniqueScopes.join(', ')}.`;
}
