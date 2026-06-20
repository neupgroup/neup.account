export const ROLE_SCOPE_MODES = ['managable', 'public', 'toApprove', 'root'] as const;

export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';
export type ScopeMode = (typeof ROLE_SCOPE_MODES)[number];
export type ScopeAccountKey = 'individual' | 'dependent' | 'brand' | 'branch';
export type ScopeAudience = Record<ScopeAccountKey, boolean>;
export type RoleScope = string;

const ENCODED_SCOPE_PATTERN =
  /^(managable|public|toApprove|root)\.i([01])([01])b([01])([01])$/;

const LEGACY_SCOPE_MAP: Record<string, string> = {
  root: 'root.i10b00',
  'individual.root': 'root.i10b00',
  public: 'public.i11b11',
  managed: 'managable.i11b11',
  manageable: 'managable.i11b11',
  default: 'public.i10b00',
  application: 'public.i11b11',
  brand: 'managable.i00b10',
  toApprove: 'toApprove.i11b11',
  managable: 'managable.i11b11',
  'brand.managable': 'managable.i00b10',
  'branch.brand.managable': 'managable.i00b01',
  'individual.managable': 'managable.i10b00',
  'dependent.individual.managable': 'managable.i01b00',
  'individual.public': 'public.i10b00',
  'brand.public': 'public.i00b10',
  'branch.brand.public': 'public.i00b01',
  'dependent.individual.public': 'public.i01b00',
  'individual.toApprove': 'toApprove.i10b00',
  'dependent.individual.toApprove': 'toApprove.i01b00',
  'brand.toApprove': 'toApprove.i00b10',
  'branch.brand.toApprove': 'toApprove.i00b01',
};

const ROLE_SCOPE_SET = new Set<string>(
  [
    'root.i10b00',
    'public.i10b00',
    'public.i01b00',
    'public.i11b00',
    'public.i00b10',
    'public.i00b01',
    'public.i00b11',
    'public.i11b11',
    'managable.i10b00',
    'managable.i01b00',
    'managable.i11b00',
    'managable.i00b10',
    'managable.i00b01',
    'managable.i00b11',
    'managable.i11b11',
    'toApprove.i10b00',
    'toApprove.i01b00',
    'toApprove.i11b00',
    'toApprove.i00b10',
    'toApprove.i00b01',
    'toApprove.i00b11',
    'toApprove.i11b11',
  ],
);

function normalizeMode(mode: string | null | undefined): ScopeMode | null {
  const normalized = (mode ?? '').trim();
  return ROLE_SCOPE_MODES.includes(normalized as ScopeMode) ? (normalized as ScopeMode) : null;
}

export function normalizeAccountTypeForRoleScope(
  accountType: string | null | undefined,
): 'brand' | 'branch' | 'dependent' | 'individual' | 'other' {
  const normalized = (accountType ?? '').trim().toLowerCase();
  if (normalized === 'brand') return 'brand';
  if (normalized === 'branch') return 'branch';
  if (normalized === 'dependent') return 'dependent';
  if (normalized === 'individual') return 'individual';
  return 'other';
}

export function emptyScopeAudience(): ScopeAudience {
  return {
    individual: false,
    dependent: false,
    brand: false,
    branch: false,
  };
}

export function encodeRoleScope(mode: ScopeMode, audience: ScopeAudience): string {
  if (mode === 'root') {
    return 'root.i10b00';
  }

  return `${mode}.i${audience.individual ? '1' : '0'}${audience.dependent ? '1' : '0'}b${audience.brand ? '1' : '0'}${audience.branch ? '1' : '0'}`;
}

export function decodeRoleScope(
  scope: string | null | undefined,
): { mode: ScopeMode; audience: ScopeAudience; normalized: string } | null {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return null;

  const match = ENCODED_SCOPE_PATTERN.exec(normalized);
  if (!match) return null;

  const [, mode, individual, dependent, brand, branch] = match;
  return {
    mode: mode as ScopeMode,
    normalized,
    audience: {
      individual: individual === '1',
      dependent: dependent === '1',
      brand: brand === '1',
      branch: branch === '1',
    },
  };
}

export function normalizeRoleScope(scope: string | null | undefined): string | null {
  const normalized = (scope ?? '').trim();
  if (!normalized) return null;

  const encodedMatch = ENCODED_SCOPE_PATTERN.exec(normalized);
  if (encodedMatch) {
    const mode = encodedMatch[1] as ScopeMode;
    const next = encodeRoleScope(mode, {
      individual: encodedMatch[2] === '1',
      dependent: encodedMatch[3] === '1',
      brand: encodedMatch[4] === '1',
      branch: encodedMatch[5] === '1',
    });
    return next;
  }

  return LEGACY_SCOPE_MAP[normalized] ?? null;
}

export function isKnownRoleScope(scope: string): scope is RoleScope {
  const normalized = normalizeRoleScope(scope);
  return normalized !== null && ROLE_SCOPE_SET.has(normalized);
}

export function roleScopeError() {
  return 'Role scope must use one of managable, public, toApprove, or root with the encoded i..b.. account mask.';
}

export function roleScopeModeForAssignment(mode: ScopeMode): RoleAssignmentMode {
  if (mode === 'managable') return 'manageable';
  return mode;
}

export function expectedRoleScopeForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope | null {
  const normalized = normalizeAccountTypeForRoleScope(accountType);
  const baseMode: ScopeMode =
    mode === 'manageable' ? 'managable' : mode === 'public' ? 'public' : mode === 'toApprove' ? 'toApprove' : 'root';

  if (baseMode === 'root') {
    return normalized === 'individual' ? 'root.i10b00' : null;
  }

  const audience = emptyScopeAudience();
  if (normalized === 'individual') audience.individual = true;
  else if (normalized === 'dependent') audience.dependent = true;
  else if (normalized === 'brand') audience.brand = true;
  else if (normalized === 'branch') audience.branch = true;
  else return null;

  return encodeRoleScope(baseMode, audience);
}

export function expectedRoleScopesForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope[] {
  const specificScope = expectedRoleScopeForAccount(accountType, mode);
  return specificScope ? [specificScope] : [];
}

function audienceContainsAccountType(audience: ScopeAudience, accountType: ScopeAccountKey): boolean {
  return audience[accountType];
}

export function canAssignRoleScopeToAccount(
  scope: string | null | undefined,
  accountType: string | null | undefined,
  modes: RoleAssignmentMode[],
): boolean {
  const decoded = decodeRoleScope(scope);
  if (!decoded) return false;

  const targetAccountType = normalizeAccountTypeForRoleScope(accountType);
  if (targetAccountType === 'other') return false;

  const allowedModes = new Set(modes.map((mode) => (mode === 'manageable' ? 'managable' : mode)));
  if (!allowedModes.has(decoded.mode)) return false;

  return audienceContainsAccountType(decoded.audience, targetAccountType);
}

export function isRootRoleScope(scope: string | null | undefined): boolean {
  const decoded = decodeRoleScope(scope);
  return decoded?.mode === 'root';
}

export function scopeCoversRoleScope(
  grantedScope: string | null | undefined,
  roleScope: string | null | undefined,
): boolean {
  const granted = decodeRoleScope(grantedScope);
  const role = decodeRoleScope(roleScope);
  if (!granted || !role) return false;
  if (granted.mode !== role.mode) return false;

  return (
    (!role.audience.individual || granted.audience.individual) &&
    (!role.audience.dependent || granted.audience.dependent) &&
    (!role.audience.brand || granted.audience.brand) &&
    (!role.audience.branch || granted.audience.branch)
  );
}

export function formatScopeAudience(scope: string | null | undefined): string {
  const decoded = decodeRoleScope(scope);
  if (!decoded) return scope?.trim() || '';

  const labels: string[] = [];
  if (decoded.audience.individual) labels.push('individual');
  if (decoded.audience.dependent) labels.push('dependent');
  if (decoded.audience.brand) labels.push('brand');
  if (decoded.audience.branch) labels.push('branch');
  return labels.join(', ');
}
