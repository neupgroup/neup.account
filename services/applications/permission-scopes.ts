import { expandRoleScope, type RoleScope } from '@/services/role-scopes';

export const PERMISSION_SCOPE_OPTIONS = [] as const;

export type PermissionScopeOption = RoleScope;

/**
 * ::neup.documentation::permission-scopes-module
 * ::title Permission Scope Helpers
 *
 * Normalizes and validates permission-scope values against the shared role-scope vocabulary.
 *
 * ::public
 *
 * Use this module when permissions are edited or imported with scope values that need to be expanded and deduplicated.
 *
 * ::public end
 *
 * ::private
 *
 * Scope values are treated as valid only when they expand into one or more known role scopes.
 *
 * ::private end
 *
 * ::end
 */
export function isKnownPermissionScope(scope: string): scope is PermissionScopeOption {
  return expandRoleScope(scope).length > 0;
}

export function permissionScopeError() {
  return 'Permission scope entries must use one of the known role scopes such as acMgmt.self or rootMgmt.self.';
}

export function normalizePermissionScopes(value: unknown): PermissionScopeOption[] {
  /**
   * ::neup.documentation::permission-scopes-normalize-scopes
   * ::function normalizePermissionScopes(value)
   *
   * Expands raw permission-scope values into a deduplicated normalized scope list.
   *
   * ::public
   *
   * The input can be a single string or an array of strings.
   *
   * ::public end
   *
   * ::private
   *
   * Expansion relies on `expandRoleScope()` so aliases and compressed scope forms are supported.
   *
   * ::private end
   *
   * ::end
   */
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
