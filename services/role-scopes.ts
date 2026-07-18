export const ROLE_SCOPE_KEYS = [
  'acMgmt.self',
  'acMgmt.brand',
  'acMgmt.brandSubbrand',
  'acMgmt.subbrand',
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

/*
::neup.documentation::role-access-flags
::title Role Access Flags

Defines the semantic role and permission access flags used across authz management.

::public

The helpers in this module translate between the current persisted acquisition and approval columns and the higher-level flags used by role and permission editors.

::public end

::private

The storage mapping intentionally remains backward-compatible:
- `assignment` + `none` => `assignable`
- `public_request` + `none` => `publiclyEnrollable`
- `system_generated` => `assignable`
- `invitation` + `none` => `rootAssigned`
- `public_request` + `approval_required` => `publiclyRequestable`
- `invitation` + `approval_required` => `requestableToOwner`

::private end

::end
*/
export type RoleScope = (typeof ROLE_SCOPE_KEYS)[number];
export type RoleAcquisitionType = (typeof ROLE_ACQUISITION_TYPES)[number];
export type RoleApprovalPolicy = (typeof ROLE_APPROVAL_POLICIES)[number];
export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';
export type ScopeMode = 'acMgmt' | 'rootMgmt';
export type ScopeAccountKey = 'individual' | 'dependent' | 'brand' | 'subbrand';
export type ScopeAudience = Record<ScopeAccountKey, boolean>;
export type RoleRequestTarget = 'admin' | 'owner';
export type RoleAccessFlags = {
  assignable: boolean;
  publiclyEnrollable: boolean;
  rootAssigned: boolean;
  publiclyRequestable: boolean;
  requestableToOwner: boolean;
};

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
  'managed.branch': 'acMgmt.subbrand',
  'managed.subbrand': 'acMgmt.subbrand',
  'public.branch': 'acMgmt.subbrand',
  'public.subbrand': 'acMgmt.subbrand',
  'toApprove.branch': 'acMgmt.subbrand',
  'toApprove.subbrand': 'acMgmt.subbrand',
  'branch.brand.managable': 'acMgmt.subbrand',
  'branch.brand.public': 'acMgmt.subbrand',
  'branch.brand.toApprove': 'acMgmt.subbrand',
  'subbrand.brand.managable': 'acMgmt.subbrand',
  'subbrand.brand.public': 'acMgmt.subbrand',
  'subbrand.brand.toApprove': 'acMgmt.subbrand',
  'managed.0001': 'acMgmt.subbrand',
  'managed.i0001': 'acMgmt.subbrand',
  'managable.i0001': 'acMgmt.subbrand',
  'public.0001': 'acMgmt.subbrand',
  'public.i0001': 'acMgmt.subbrand',
  'toApprove.0001': 'acMgmt.subbrand',
  'toApprove.i0001': 'acMgmt.subbrand',
};

function normalizedAccountType(
  accountType: string | null | undefined,
): 'brand' | 'subbrand' | 'dependent' | 'individual' | 'other' {
  const normalized = (accountType ?? '').trim().toLowerCase();
  if (normalized === 'brand') return 'brand';
  if (normalized === 'branch' || normalized === 'subbrand') return 'subbrand';
  if (normalized === 'dependent') return 'dependent';
  if (normalized === 'individual') return 'individual';
  return 'other';
}

export function normalizeAccountTypeForRoleScope(
  accountType: string | null | undefined,
): 'brand' | 'subbrand' | 'dependent' | 'individual' | 'other' {
  return normalizedAccountType(accountType);
}

function normalizeScopeToken(scope: string | null | undefined): RoleScope | null {
  const trimmed = (scope ?? '').trim();
  if (!trimmed) return null;
  if (ROLE_SCOPE_SET.has(trimmed)) return trimmed as RoleScope;
  return LEGACY_SCOPE_MAP[trimmed] ?? null;
}

function expandStringRoleScope(scope: string): RoleScope[] {
  const trimmed = scope.trim();
  if (!trimmed) return [];

  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return normalizeRoleScopes(parsed);
    } catch {
      // Fall through to single-token normalization when legacy rows contain plain strings.
    }
  }

  const normalized = normalizeScopeToken(trimmed);
  return normalized ? [normalized] : [];
}

export function normalizeRoleScopes(scope: unknown): RoleScope[] {
  const values = Array.isArray(scope)
    ? scope
    : typeof scope === 'string'
      ? expandStringRoleScope(scope)
      : [];
  const normalized: RoleScope[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const next = normalizeScopeToken(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

export function normalizeRoleScope(scope: unknown): RoleScope | null {
  return normalizeRoleScopes(scope)[0] ?? null;
}

export function expandRoleScope(scope: unknown): RoleScope[] {
  return normalizeRoleScopes(scope);
}

export function emptyScopeAudience(): ScopeAudience {
  return {
    individual: false,
    dependent: false,
    brand: false,
    subbrand: false,
  };
}

export function decodeRoleScope(
  scope: unknown,
): { mode: ScopeMode; audience: ScopeAudience; normalized: RoleScope } | null {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return null;

  switch (normalized) {
    case 'acMgmt.self':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: true, dependent: false, brand: false, subbrand: false },
      };
    case 'acMgmt.brand':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: true, subbrand: false },
      };
    case 'acMgmt.brandSubbrand':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: true, subbrand: true },
      };
    case 'acMgmt.subbrand':
      return {
        mode: 'acMgmt',
        normalized,
        audience: { individual: false, dependent: false, brand: false, subbrand: true },
      };
    case 'rootMgmt.self':
      return {
        mode: 'rootMgmt',
        normalized,
        audience: { individual: true, dependent: false, brand: false, subbrand: false },
      };
    default:
      return null;
  }
}

export function isKnownRoleScope(scope: string): scope is RoleScope {
  return normalizeScopeToken(scope) !== null;
}

export function roleScopeError() {
  return 'Role scope must use one of: acMgmt.self, acMgmt.brand, acMgmt.brandSubbrand, acMgmt.subbrand, rootMgmt.self.';
}

export function encodeRoleScope(mode: ScopeMode, audience: ScopeAudience): RoleScope {
  if (mode === 'rootMgmt') return 'rootMgmt.self';
  if (audience.brand && audience.subbrand) return 'acMgmt.brandSubbrand';
  if (audience.brand) return 'acMgmt.brand';
  if (audience.subbrand) return 'acMgmt.subbrand';
  return 'acMgmt.self';
}

function roleScopeMatchesAccountType(scope: RoleScope, accountType: string | null | undefined): boolean {
  const normalizedType = normalizedAccountType(accountType);

  switch (scope) {
    case 'acMgmt.self':
      return normalizedType === 'individual' || normalizedType === 'dependent';
    case 'acMgmt.brand':
      return normalizedType === 'brand';
    case 'acMgmt.brandSubbrand':
      return normalizedType === 'brand' || normalizedType === 'subbrand';
    case 'acMgmt.subbrand':
      return normalizedType === 'subbrand';
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
    return ['acMgmt.brand', 'acMgmt.brandSubbrand'];
  }

  if (normalizedType === 'subbrand') {
    return ['acMgmt.subbrand', 'acMgmt.brandSubbrand'];
  }

  return [];
}

export function canAssignRoleScopeToAccount(
  scope: unknown,
  accountType: string | null | undefined,
  modes: RoleAssignmentMode[],
): boolean {
  const normalizedScopes = normalizeRoleScopes(scope);
  if (normalizedScopes.length === 0) return false;

  return normalizedScopes.some((normalizedScope) => {
    if (normalizedScope === 'rootMgmt.self') {
      return modes.includes('root') && roleScopeMatchesAccountType(normalizedScope, accountType);
    }

    return modes.some((mode) => NON_ROOT_ASSIGNMENT_MODES.has(mode)) &&
      roleScopeMatchesAccountType(normalizedScope, accountType);
  });
}

export function isRootRoleScope(scope: unknown): boolean {
  return normalizeRoleScopes(scope).includes('rootMgmt.self');
}

export function scopeCoversRoleScope(
  grantedScope: unknown,
  roleScope: unknown,
): boolean {
  const granted = new Set(normalizeRoleScopes(grantedScope));
  return normalizeRoleScopes(roleScope).some((scope) => granted.has(scope));
}

function formatSingleScopeAudience(scope: RoleScope): string {
  if (scope === 'acMgmt.brandSubbrand') return 'brand, subbrand';
  if (scope === 'acMgmt.brand') return 'brand';
  if (scope === 'acMgmt.subbrand') return 'subbrand';
  return 'self';
}

export function formatScopeAudience(scope: unknown): string {
  const normalized = normalizeRoleScopes(scope);
  if (normalized.length === 0) {
    if (typeof scope === 'string') return scope.trim();
    return '';
  }
  return normalized.map((item) => formatSingleScopeAudience(item)).join(' + ');
}

export function formatRoleScopeForDisplay(scope: unknown): string {
  const normalized = normalizeRoleScopes(scope);
  if (normalized.length > 0) return normalized.join(', ');
  if (typeof scope === 'string') return scope.trim();
  return '';
}

export function formatMergedScopeLabels(
  scopes: unknown[],
): string[] {
  return Array.from(
    new Set(
      scopes
        .flatMap((scope) => normalizeRoleScopes(scope))
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

export function emptyRoleAccessFlags(): RoleAccessFlags {
  return {
    assignable: false,
    publiclyEnrollable: false,
    rootAssigned: false,
    publiclyRequestable: false,
    requestableToOwner: false,
  };
}

export function normalizeRoleAccessFlags(
  value: Partial<RoleAccessFlags> | null | undefined,
): RoleAccessFlags {
  return {
    assignable: value?.assignable === true,
    publiclyEnrollable: value?.publiclyEnrollable === true,
    rootAssigned: value?.rootAssigned === true,
    publiclyRequestable: value?.publiclyRequestable === true,
    requestableToOwner: value?.requestableToOwner === true,
  };
}

export function getRoleAccessFlags(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
): RoleAccessFlags {
  const normalizedAcquisitionType = normalizeRoleAcquisitionType(acquisitionType);
  const normalizedApprovalPolicy = normalizeRoleApprovalPolicy(approvalPolicy);

  if (normalizedAcquisitionType === 'system_generated') {
    return { ...emptyRoleAccessFlags(), assignable: true };
  }

  if (normalizedAcquisitionType === 'invitation' && normalizedApprovalPolicy === 'approval_required') {
    return { ...emptyRoleAccessFlags(), requestableToOwner: true };
  }

  if (normalizedAcquisitionType === 'invitation') {
    return { ...emptyRoleAccessFlags(), rootAssigned: true };
  }

  if (normalizedAcquisitionType === 'public_request' && normalizedApprovalPolicy === 'approval_required') {
    return { ...emptyRoleAccessFlags(), publiclyRequestable: true };
  }

  if (normalizedAcquisitionType === 'public_request') {
    return { ...emptyRoleAccessFlags(), publiclyEnrollable: true };
  }

  return { ...emptyRoleAccessFlags(), assignable: true };
}

export function getStoredRoleAccessPolicy(
  input: Partial<RoleAccessFlags> | { acquisitionType?: string | null; approvalPolicy?: string | null } | null | undefined,
): { acquisitionType: RoleAcquisitionType; approvalPolicy: RoleApprovalPolicy; flags: RoleAccessFlags } {
  const hasExplicitFlags = !!input && (
    'assignable' in input ||
    'publiclyEnrollable' in input ||
    'rootAssigned' in input ||
    'publiclyRequestable' in input ||
    'requestableToOwner' in input
  );

  const flags = hasExplicitFlags
    ? normalizeRoleAccessFlags(input as Partial<RoleAccessFlags>)
    : getRoleAccessFlags(
        (input as { acquisitionType?: string | null } | null | undefined)?.acquisitionType,
        (input as { approvalPolicy?: string | null } | null | undefined)?.approvalPolicy,
      );

  if (flags.assignable) {
    return { acquisitionType: 'assignment', approvalPolicy: 'none', flags };
  }
  if (flags.requestableToOwner) {
    return { acquisitionType: 'invitation', approvalPolicy: 'approval_required', flags };
  }
  if (flags.rootAssigned) {
    return { acquisitionType: 'invitation', approvalPolicy: 'none', flags };
  }
  if (flags.publiclyRequestable) {
    return { acquisitionType: 'public_request', approvalPolicy: 'approval_required', flags };
  }
  if (flags.publiclyEnrollable) {
    return { acquisitionType: 'public_request', approvalPolicy: 'none', flags };
  }

  return { acquisitionType: 'assignment', approvalPolicy: 'none', flags: { ...emptyRoleAccessFlags(), assignable: true } };
}

export function isRoleDirectlyAssignable(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
  actor: 'manager' | 'root' = 'manager',
): boolean {
  const flags = getRoleAccessFlags(acquisitionType, approvalPolicy);
  return flags.assignable || (actor === 'root' && flags.rootAssigned);
}

export function isDirectlyAssignableRoleAcquisitionType(value: string | null | undefined): boolean {
  return isRoleDirectlyAssignable(value, 'none', 'manager');
}

export function isSelfRequestableRoleAcquisitionType(value: string | null | undefined): boolean {
  const flags = getRoleAccessFlags(value, 'none');
  return flags.publiclyEnrollable || flags.publiclyRequestable || flags.requestableToOwner;
}

export function roleApprovalRequiresRequest(value: string | null | undefined): boolean {
  return normalizeRoleApprovalPolicy(value) === 'approval_required';
}

export function roleRequiresApproval(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
): boolean {
  const flags = getRoleAccessFlags(acquisitionType, approvalPolicy);
  return flags.publiclyRequestable || flags.requestableToOwner;
}

export function roleRequestTarget(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
): RoleRequestTarget | null {
  const flags = getRoleAccessFlags(acquisitionType, approvalPolicy);
  if (flags.requestableToOwner) return 'owner';
  if (flags.publiclyRequestable) return 'admin';
  return null;
}
