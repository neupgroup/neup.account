export const ROLE_SCOPE_OPTIONS = [
  'brand.managable',
  'branch.brand.managable',
  'individual.managable',
  'dependent.individual.managable',
  'individual.root',
  'individual.public',
  'brand.public',
  'branch.brand.public',
  'dependent.individual.public',
  'individual.toApprove',
  'dependent.individual.toApprove',
  'brand.toApprove',
  'branch.brand.toApprove',
] as const;

export type RoleScope = (typeof ROLE_SCOPE_OPTIONS)[number];
export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';

const ROLE_SCOPE_SET = new Set<string>(ROLE_SCOPE_OPTIONS);

export function isKnownRoleScope(scope: string): scope is RoleScope {
  return ROLE_SCOPE_SET.has(scope);
}

export function roleScopeError() {
  return `Role scope must be one of: ${ROLE_SCOPE_OPTIONS.join(', ')}.`;
}

export function normalizeAccountTypeForRoleScope(accountType: string | null | undefined): 'brand' | 'branch' | 'dependent' | 'individual' | 'other' {
  const normalized = (accountType ?? '').trim().toLowerCase();
  if (normalized === 'brand') return 'brand';
  if (normalized === 'branch') return 'branch';
  if (normalized === 'dependent') return 'dependent';
  if (normalized === 'individual') return 'individual';
  return 'other';
}

export function expectedRoleScopeForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope | null {
  const normalized = normalizeAccountTypeForRoleScope(accountType);

  if (mode === 'manageable') {
    if (normalized === 'brand') return 'brand.managable';
    if (normalized === 'branch') return 'branch.brand.managable';
    if (normalized === 'dependent') return 'dependent.individual.managable';
    if (normalized === 'individual') return 'individual.managable';
    return null;
  }

  if (mode === 'public') {
    if (normalized === 'brand') return 'brand.public';
    if (normalized === 'branch') return 'branch.brand.public';
    if (normalized === 'dependent') return 'dependent.individual.public';
    if (normalized === 'individual') return 'individual.public';
    return null;
  }

  if (mode === 'toApprove') {
    if (normalized === 'brand') return 'brand.toApprove';
    if (normalized === 'branch') return 'branch.brand.toApprove';
    if (normalized === 'dependent') return 'dependent.individual.toApprove';
    if (normalized === 'individual') return 'individual.toApprove';
    return null;
  }

  if (mode === 'root') {
    return normalized === 'individual' ? 'individual.root' : null;
  }

  return null;
}

export function canAssignRoleScopeToAccount(
  scope: string | null | undefined,
  accountType: string | null | undefined,
  modes: RoleAssignmentMode[],
): boolean {
  if (!scope) return false;
  return modes.some((mode) => expectedRoleScopeForAccount(accountType, mode) === scope);
}

