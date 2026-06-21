import { normalizePermissionScopes, type PermissionScopeOption } from '@/services/applications/permission-scopes';
import { decodeRoleScope, normalizeRoleScope, scopeCoversRoleScope } from '@/services/role-scopes';

export type ProgressiveScopeLevel = 'toApprove' | 'managed' | 'public' | 'root' | 'unknown';

function normalizeScope(scope: string | null | undefined): string {
  return normalizeRoleScope(scope) ?? (scope ?? '').trim();
}

export function getProgressiveScopeLevel(scope: string | null | undefined): ProgressiveScopeLevel {
  const decoded = decodeRoleScope(scope);
  return decoded?.mode ?? 'unknown';
}

export function getAllowedPermissionLevelsForRoleScope(
  scope: string | null | undefined,
): PermissionScopeOption[] {
  const normalized = normalizeRoleScope(scope);
  return normalized ? [normalized] : [];
}

export function isPermissionScopeAllowedForRoleScope(
  permissionScopes: unknown,
  roleScope: string | null | undefined,
): boolean {
  const normalizedRoleScope = normalizeRoleScope(roleScope);
  if (!normalizedRoleScope) return false;

  return normalizePermissionScopes(permissionScopes).some((scope) =>
    scopeCoversRoleScope(scope, normalizedRoleScope),
  );
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
