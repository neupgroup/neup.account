export const ROLE_SCOPE_KEYS = [
  'acMgmt.self',
  'acMgmt.brand',
  'acMgmt.brandBranch',
  'acMgmt.branch',
  'rootMgmt.self',
] as const;

export const ROLE_ACQUISITION_TYPES = [
  'assignment',
  'public_request',
  'invitation',
  'system_generated',
] as const;

export const ROLE_APPROVAL_POLICIES = [
  'none',
  'approval_required',
] as const;

export type RoleScope = (typeof ROLE_SCOPE_KEYS)[number];
export type RoleAcquisitionType = (typeof ROLE_ACQUISITION_TYPES)[number];
export type RoleApprovalPolicy = (typeof ROLE_APPROVAL_POLICIES)[number];
export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';
export type ScopeMode = 'acMgmt' | 'rootMgmt';
export type ScopeAccountKey = 'individual' | 'dependent' | 'brand' | 'branch';
export type ScopeAudience = Record<ScopeAccountKey, boolean>;

const ROLE_SCOPE_SET = new Set<string>(ROLE_SCOPE_KEYS);
const NON_ROOT_ASSIGNMENT_MODES = new Set<RoleAssignmentMode>(['manageable', 'public', 'toApprove']);

const LEGACY_SCOPE_MAP: Record<string, RoleScope> = {
  root: 'rootMgmt.self',
  'individual.root': 'rootMgmt.self',
  'root.individual': 'rootMgmt.self',
  'root.1000': 'rootMgmt.self',
  'root.i1000': 'rootMgmt.self',
  public: 'acMgmt.self',
  default: 'acMgmt.self',
  application: 'acMgmt.self',
  managed: 'acMgmt.self',
  manageable: 'acMgmt.self',
  managable: 'acMgmt.self',
  toApprove: 'acMgmt.self',
  'public.individual': 'acMgmt.self',
  'public.dependent': 'acMgmt.self',
  'managed.individual': 'acMgmt.self',
  'managed.dependent': 'acMgmt.self',
  'toApprove.individual': 'acMgmt.self',
  'toApprove.dependent': 'acMgmt.self',
  'individual.public': 'acMgmt.self',
  'dependent.individual.public': 'acMgmt.self',
  'individual.managable': 'acMgmt.self',
  'dependent.individual.managable': 'acMgmt.self',
  'individual.toApprove': 'acMgmt.self',
  'dependent.individual.toApprove': 'acMgmt.self',
  'managed.1000': 'acMgmt.self',
  'managed.0100': 'acMgmt.self',
  'managed.i1000': 'acMgmt.self',
  'managed.i0100': 'acMgmt.self',
  'managable.i1000': 'acMgmt.self',
  'managable.i0100': 'acMgmt.self',
  'public.1000': 'acMgmt.self',
  'public.0100': 'acMgmt.self',
  'public.i1000': 'acMgmt.self',
  'public.i0100': 'acMgmt.self',
  'toApprove.1000': 'acMgmt.self',
  'toApprove.0100': 'acMgmt.self',
  'toApprove.i1000': 'acMgmt.self',
  'toApprove.i0100': 'acMgmt.self',
  brand: 'acMgmt.brand',
  'managed.brand': 'acMgmt.brand',
  'public.brand': 'acMgmt.brand',
  'toApprove.brand': 'acMgmt.brand',
  'brand.managable': 'acMgmt.brand',
  'brand.public': 'acMgmt.brand',
  'brand.toApprove': 'acMgmt.brand',
  'managed.0010': 'acMgmt.brand',
  'managed.i0010': 'acMgmt.brand',
  'managable.i0010': 'acMgmt.brand',
  'public.0010': 'acMgmt.brand',
  'public.i0010': 'acMgmt.brand',
  'toApprove.0010': 'acMgmt.brand',
  'toApprove.i0010': 'acMgmt.brand',
  'managed.branch': 'acMgmt.branch',
  'public.branch': 'acMgmt.branch',
  'toApprove.branch': 'acMgmt.branch',
  'branch.brand.managable': 'acMgmt.branch',
  'branch.brand.public': 'acMgmt.branch',
  'branch.brand.toApprove': 'acMgmt.branch',
  'managed.0001': 'acMgmt.branch',
  'managed.i0001': 'acMgmt.branch',
  'managable.i0001': 'acMgmt.branch',
  'public.0001': 'acMgmt.branch',
  'public.i0001': 'acMgmt.branch',
  'toApprove.0001': 'acMgmt.branch',
  'toApprove.i0001': 'acMgmt.branch',
};

function normalizedAccountType(
  accountType: string | null | undefined,
): 'brand' | 'branch' | 'dependent' | 'individual' | 'other' {
  const normalized = (accountType ?? '').trim().toLowerCase();
  if (normalized === 'brand') return 'brand';
  if (normalized === 'branch') return 'branch';
  if (normalized === 'dependent') return 'dependent';
  if (normalized === 'individual') return 'individual';
  return 'other';
}

export function normalizeAccountTypeForRoleScope(
  accountType: string | null | undefined,
): 'brand' | 'branch' | 'dependent' | 'individual' | 'other' {
  return normalizedAccountType(accountType);
}

export function normalizeRoleScope(scope: string | null | undefined): RoleScope | null {
  const trimmed = (scope ?? '').trim();
  if (!trimmed) return null;
  if (ROLE_SCOPE_SET.has(trimmed)) return trimmed as RoleScope;
  return LEGACY_SCOPE_MAP[trimmed] ?? null;
}

export function expandRoleScope(scope: string | null | undefined): RoleScope[] {
  const normalized = normalizeRoleScope(scope);
  return normalized ? [normalized] : [];
}

export function emptyScopeAudience(): ScopeAudience {
  return {
    individual: false,
    dependent: false,
    brand: false,
    branch: false,
  };
}

export function decodeRoleScope(
  scope: string | null | undefined,
): { mode: ScopeMode; audience: ScopeAudience; normalized: RoleScope } | null {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return null;

  switch (normalized) {
    case 'acMgmt.self':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: true, dependent: false, brand: false, branch: false },
      };
    case 'acMgmt.brand':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: true, branch: false },
      };
    case 'acMgmt.brandBranch':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: true, branch: true },
      };
    case 'acMgmt.branch':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: false, branch: true },
      };
    case 'rootMgmt.self':
      return {
        mode: 'rootMgmt',
        normalized,
        audience: { individual: true, dependent: false, brand: false, branch: false },
      };
    default:
      return null;
  }
}

export function isKnownRoleScope(scope: string): scope is RoleScope {
  return normalizeRoleScope(scope) !== null;
}

export function roleScopeError() {
  return 'Role scope must use one of: acMgmt.self, acMgmt.brand, acMgmt.brandBranch, acMgmt.branch, rootMgmt.self.';
}

export function encodeRoleScope(mode: ScopeMode, audience: ScopeAudience): RoleScope {
  if (mode === 'rootMgmt') return 'rootMgmt.self';
  if (audience.brand && audience.branch) return 'acMgmt.brandBranch';
  if (audience.brand) return 'acMgmt.brand';
  if (audience.branch) return 'acMgmt.branch';
  return 'acMgmt.self';
}

function roleScopeMatchesAccountType(scope: RoleScope, accountType: string | null | undefined): boolean {
  const normalizedType = normalizedAccountType(accountType);

  switch (scope) {
    case 'acMgmt.self':
      return normalizedType === 'individual' || normalizedType === 'dependent';
    case 'acMgmt.brand':
      return normalizedType === 'brand';
    case 'acMgmt.brandBranch':
      return normalizedType === 'brand' || normalizedType === 'branch';
    case 'acMgmt.branch':
      return normalizedType === 'branch';
    case 'rootMgmt.self':
      return normalizedType === 'individual';
    default:
      return false;
  }
}

export function expectedRoleScopeForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope | null {
  return expectedRoleScopesForAccount(accountType, mode)[0] ?? null;
}

export function expectedRoleScopesForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope[] {
  const normalizedType = normalizedAccountType(accountType);

  if (mode === 'root') {
    return normalizedType === 'individual' ? ['rootMgmt.self'] : [];
  }

  if (normalizedType === 'individual' || normalizedType === 'dependent') {
    return ['acMgmt.self'];
  }

  if (normalizedType === 'brand') {
    return ['acMgmt.brand', 'acMgmt.brandBranch'];
  }

  if (normalizedType === 'branch') {
    return ['acMgmt.branch', 'acMgmt.brandBranch'];
  }

  return [];
}

export function canAssignRoleScopeToAccount(
  scope: string | null | undefined,
  accountType: string | null | undefined,
  modes: RoleAssignmentMode[],
): boolean {
  const normalizedScope = normalizeRoleScope(scope);
  if (!normalizedScope) return false;

  if (normalizedScope === 'rootMgmt.self') {
    return modes.includes('root') && roleScopeMatchesAccountType(normalizedScope, accountType);
  }

  return modes.some((mode) => NON_ROOT_ASSIGNMENT_MODES.has(mode)) &&
    roleScopeMatchesAccountType(normalizedScope, accountType);
}

export function isRootRoleScope(scope: string | null | undefined): boolean {
  return normalizeRoleScope(scope) === 'rootMgmt.self';
}

export function scopeCoversRoleScope(
  grantedScope: string | null | undefined,
  roleScope: string | null | undefined,
): boolean {
  return normalizeRoleScope(grantedScope) === normalizeRoleScope(roleScope);
}

export function formatScopeAudience(scope: string | null | undefined): string {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return (scope ?? '').trim();
  if (normalized === 'acMgmt.brandBranch') return 'brand, branch';
  if (normalized === 'acMgmt.brand') return 'brand';
  if (normalized === 'acMgmt.branch') return 'branch';
  return 'self';
}

export function formatRoleScopeForDisplay(scope: string | null | undefined): string {
  return normalizeRoleScope(scope) ?? (scope ?? '').trim();
}

export function formatMergedScopeLabels(
  scopes: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      scopes
        .map((scope) => normalizeRoleScope(scope) ?? (scope ?? '').trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeRoleAcquisitionType(
  value: string | null | undefined,
): RoleAcquisitionType {
  const normalized = (value ?? '').trim();
  return ROLE_ACQUISITION_TYPES.includes(normalized as RoleAcquisitionType)
    ? (normalized as RoleAcquisitionType)
    : 'assignment';
}

export function normalizeRoleApprovalPolicy(
  value: string | null | undefined,
): RoleApprovalPolicy {
  const normalized = (value ?? '').trim();
  return ROLE_APPROVAL_POLICIES.includes(normalized as RoleApprovalPolicy)
    ? (normalized as RoleApprovalPolicy)
    : 'none';
}

export function isDirectlyAssignableRoleAcquisitionType(value: string | null | undefined): boolean {
  const normalized = normalizeRoleAcquisitionType(value);
  return normalized === 'assignment' || normalized === 'public_request';
}

export function isSelfRequestableRoleAcquisitionType(value: string | null | undefined): boolean {
  return normalizeRoleAcquisitionType(value) === 'public_request';
}

export function roleApprovalRequiresRequest(value: string | null | undefined): boolean {
  return normalizeRoleApprovalPolicy(value) === 'approval_required';
}
