import { ROLE_SCOPE_OPTIONS } from '@/services/role-scopes';

export type ProgressiveScopeLevel = 'approval' | 'manageable' | 'public' | 'root' | 'unknown';

function normalizeScope(scope: string | null | undefined): string {
  return (scope ?? '').trim();
}

export function getProgressiveScopeLevel(scope: string | null | undefined): ProgressiveScopeLevel {
  const normalized = normalizeScope(scope);
  if (!normalized) return 'unknown';
  if (normalized === 'individual.root') return 'root';
  if (normalized === 'toApprove' || normalized.endsWith('.toApprove')) return 'approval';
  if (normalized === 'managable' || normalized.endsWith('.managable')) return 'manageable';
  if (normalized === 'public' || normalized.endsWith('.public')) return 'public';
  return 'unknown';
}

export function getAllowedPermissionLevelsForRoleScope(scope: string | null | undefined): ProgressiveScopeLevel[] {
  const level = getProgressiveScopeLevel(scope);
  if (level === 'public') return ['public'];
  if (level === 'approval') return ['approval', 'public'];
  if (level === 'manageable') return ['manageable', 'public'];
  if (level === 'root') return ['root'];
  return [];
}

export function isPermissionScopeAllowedForRoleScope(
  permissionScope: string | null | undefined,
  roleScope: string | null | undefined,
): boolean {
  const permissionLevel = getProgressiveScopeLevel(permissionScope);
  if (permissionLevel === 'unknown') return false;
  return getAllowedPermissionLevelsForRoleScope(roleScope).includes(permissionLevel);
}

export function getCompatibleRoleScopesForPermissionScopes(
  permissionScopes: readonly (string | null | undefined)[],
): string[] {
  const levels = Array.from(
    new Set(
      permissionScopes
        .map((scope) => getProgressiveScopeLevel(scope))
        .filter((level): level is Exclude<ProgressiveScopeLevel, 'unknown'> => level !== 'unknown'),
    ),
  );

  if (levels.length === 0) return [...ROLE_SCOPE_OPTIONS];
  if (levels.includes('root')) return levels.length === 1 ? ['individual.root'] : [];
  if (levels.includes('manageable')) return levels.includes('approval')
    ? []
    : ROLE_SCOPE_OPTIONS.filter((scope) => getProgressiveScopeLevel(scope) === 'manageable');
  if (levels.includes('approval')) return ROLE_SCOPE_OPTIONS.filter((scope) => getProgressiveScopeLevel(scope) === 'approval');
  return ROLE_SCOPE_OPTIONS.filter((scope) => {
    const level = getProgressiveScopeLevel(scope);
    return level === 'public' || level === 'approval' || level === 'manageable';
  });
}

export function getInvalidPermissionScopesForRoleScope(
  permissionScopes: readonly (string | null | undefined)[],
  roleScope: string | null | undefined,
): string[] {
  return permissionScopes
    .map((scope) => normalizeScope(scope))
    .filter((scope) => scope.length > 0 && !isPermissionScopeAllowedForRoleScope(scope, roleScope));
}

export function getRoleScopeCompatibilityError(
  roleScope: string | null | undefined,
  permissionScopes: readonly (string | null | undefined)[],
): string | null {
  const invalidScopes = getInvalidPermissionScopesForRoleScope(permissionScopes, roleScope);
  if (invalidScopes.length === 0) return null;

  const uniqueScopes = Array.from(new Set(invalidScopes));
  return `Role scope "${normalizeScope(roleScope)}" is incompatible with permission scopes: ${uniqueScopes.join(', ')}.`;
}
