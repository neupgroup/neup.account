import { expandRoleScope, type RoleScope } from '@/services/role-scopes';

export const PERMISSION_SCOPE_OPTIONS = [] as const;

export type PermissionScopeOption = RoleScope;

export function isKnownPermissionScope(scope: string): scope is PermissionScopeOption {
  return expandRoleScope(scope).length > 0;
}

export function permissionScopeError() {
  return 'Permission scope entries must use managed, public, toApprove, or root with a named audience like managed.brand.';
}

export function normalizePermissionScopes(value: unknown): PermissionScopeOption[] {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized: PermissionScopeOption[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string') continue;
    for (const next of expandRoleScope(rawValue)) {
      if (seen.has(next)) continue;
      seen.add(next);
      normalized.push(next);
    }
  }

  return normalized;
}

export function hasUsablePermissionScopes(value: unknown): boolean {
  return normalizePermissionScopes(value).length > 0;
}
