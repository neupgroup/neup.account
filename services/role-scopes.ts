export const ROLE_SCOPE_MODES = ['managed', 'public', 'toApprove', 'root'] as const;

export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';
export type ScopeMode = (typeof ROLE_SCOPE_MODES)[number];
export type ScopeAccountKey = 'individual' | 'dependent' | 'brand' | 'branch';
export type ScopeAudience = Record<ScopeAccountKey, boolean>;
export type RoleScope = string;

const CURRENT_SCOPE_PATTERN = /^(managed|public|toApprove|root)\.([01]{4})$/;
const LEGACY_ENCODED_SCOPE_PATTERN =
  /^(managable|managed|public|toApprove|root)\.i([01])([01])b([01])([01])$/;

const ACCOUNT_KEYS: ScopeAccountKey[] = ['individual', 'dependent', 'brand', 'branch'];

const LEGACY_SCOPE_MAP: Record<string, string[]> = {
  root: ['root.1000'],
  'individual.root': ['root.1000'],
  public: ['public.1000', 'public.0100', 'public.0010', 'public.0001'],
  default: ['public.1000'],
  application: ['public.1000', 'public.0100', 'public.0010', 'public.0001'],
  brand: ['managed.0010'],
  managed: ['managed.1000', 'managed.0100', 'managed.0010', 'managed.0001'],
  manageable: ['managed.1000', 'managed.0100', 'managed.0010', 'managed.0001'],
  managable: ['managed.1000', 'managed.0100', 'managed.0010', 'managed.0001'],
  toApprove: ['toApprove.1000', 'toApprove.0100', 'toApprove.0010', 'toApprove.0001'],
  'brand.managable': ['managed.0010'],
  'branch.brand.managable': ['managed.0001'],
  'individual.managable': ['managed.1000'],
  'dependent.individual.managable': ['managed.0100'],
  'individual.public': ['public.1000'],
  'brand.public': ['public.0010'],
  'branch.brand.public': ['public.0001'],
  'dependent.individual.public': ['public.0100'],
  'individual.toApprove': ['toApprove.1000'],
  'dependent.individual.toApprove': ['toApprove.0100'],
  'brand.toApprove': ['toApprove.0010'],
  'branch.brand.toApprove': ['toApprove.0001'],
};

const ROLE_SCOPE_SET = new Set<string>(
  ROLE_SCOPE_MODES.flatMap((mode) =>
    mode === 'root'
      ? ['root.1000']
      : ['1000', '0100', '0010', '0001'].map((bits) => `${mode}.${bits}`),
  ),
);

function normalizeMode(mode: string): ScopeMode | null {
  const normalized = mode.trim();
  if (normalized === 'managable') return 'managed';
  if (normalized === 'manageable') return 'managed';
  return ROLE_SCOPE_MODES.includes(normalized as ScopeMode) ? (normalized as ScopeMode) : null;
}

function audienceFromBits(bits: string): ScopeAudience {
  return {
    individual: bits[0] === '1',
    dependent: bits[1] === '1',
    brand: bits[2] === '1',
    branch: bits[3] === '1',
  };
}

function bitsFromAudience(audience: ScopeAudience): string {
  return [
    audience.individual ? '1' : '0',
    audience.dependent ? '1' : '0',
    audience.brand ? '1' : '0',
    audience.branch ? '1' : '0',
  ].join('');
}

function firstEnabledAccountKey(audience: ScopeAudience): ScopeAccountKey | null {
  return ACCOUNT_KEYS.find((key) => audience[key]) ?? null;
}

function singleAudience(accountKey: ScopeAccountKey): ScopeAudience {
  return {
    individual: accountKey === 'individual',
    dependent: accountKey === 'dependent',
    brand: accountKey === 'brand',
    branch: accountKey === 'branch',
  };
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
    return 'root.1000';
  }

  const accountKey = firstEnabledAccountKey(audience);
  const normalizedAudience = accountKey ? singleAudience(accountKey) : emptyScopeAudience();
  return `${mode}.${bitsFromAudience(normalizedAudience)}`;
}

export function expandRoleScope(scope: string | null | undefined): string[] {
  const normalized = (scope ?? '').trim();
  if (!normalized) return [];

  const currentMatch = CURRENT_SCOPE_PATTERN.exec(normalized);
  if (currentMatch) {
    const mode = normalizeMode(currentMatch[1]);
    if (!mode) return [];
    const bits = currentMatch[2];
    if (mode === 'root') return bits === '1000' ? ['root.1000'] : [];
    return ACCOUNT_KEYS
      .map((key, index) => (bits[index] === '1' ? `${mode}.${bitsFromAudience(singleAudience(key))}` : null))
      .filter((value): value is string => Boolean(value));
  }

  const legacyEncodedMatch = LEGACY_ENCODED_SCOPE_PATTERN.exec(normalized);
  if (legacyEncodedMatch) {
    const mode = normalizeMode(legacyEncodedMatch[1]);
    if (!mode) return [];
    if (mode === 'root') return ['root.1000'];
    const bits = `${legacyEncodedMatch[2]}${legacyEncodedMatch[3]}${legacyEncodedMatch[4]}${legacyEncodedMatch[5]}`;
    return ACCOUNT_KEYS
      .map((key, index) => (bits[index] === '1' ? `${mode}.${bitsFromAudience(singleAudience(key))}` : null))
      .filter((value): value is string => Boolean(value));
  }

  return LEGACY_SCOPE_MAP[normalized] ?? [];
}

export function normalizeRoleScope(scope: string | null | undefined): string | null {
  return expandRoleScope(scope)[0] ?? null;
}

export function decodeRoleScope(
  scope: string | null | undefined,
): { mode: ScopeMode; audience: ScopeAudience; normalized: string } | null {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return null;

  const match = CURRENT_SCOPE_PATTERN.exec(normalized);
  if (!match) return null;

  const mode = normalizeMode(match[1]);
  if (!mode) return null;

  return {
    mode,
    normalized,
    audience: audienceFromBits(match[2]),
  };
}

export function isKnownRoleScope(scope: string): scope is RoleScope {
  const normalized = normalizeRoleScope(scope);
  return normalized !== null && ROLE_SCOPE_SET.has(normalized);
}

export function roleScopeError() {
  return 'Role scope must use managed, public, toApprove, or root with a single 4-digit audience mask like managed.1000.';
}

export function expectedRoleScopeForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope | null {
  const normalizedAccountType = normalizeAccountTypeForRoleScope(accountType);
  const normalizedMode: ScopeMode =
    mode === 'manageable'
      ? 'managed'
      : mode === 'public'
      ? 'public'
      : mode === 'toApprove'
      ? 'toApprove'
      : 'root';

  if (normalizedMode === 'root') {
    return normalizedAccountType === 'individual' ? 'root.1000' : null;
  }

  if (normalizedAccountType === 'other') return null;
  return encodeRoleScope(normalizedMode, singleAudience(normalizedAccountType));
}

export function expectedRoleScopesForAccount(
  accountType: string | null | undefined,
  mode: RoleAssignmentMode,
): RoleScope[] {
  const specificScope = expectedRoleScopeForAccount(accountType, mode);
  return specificScope ? [specificScope] : [];
}

export function canAssignRoleScopeToAccount(
  scope: string | null | undefined,
  accountType: string | null | undefined,
  modes: RoleAssignmentMode[],
): boolean {
  const normalizedRoleScope = normalizeRoleScope(scope);
  if (!normalizedRoleScope) return false;

  const targetAccountType = normalizeAccountTypeForRoleScope(accountType);
  if (targetAccountType === 'other') return false;

  return modes.some((mode) => expectedRoleScopeForAccount(targetAccountType, mode) === normalizedRoleScope);
}

export function isRootRoleScope(scope: string | null | undefined): boolean {
  return normalizeRoleScope(scope) === 'root.1000';
}

export function scopeCoversRoleScope(
  grantedScope: string | null | undefined,
  roleScope: string | null | undefined,
): boolean {
  return normalizeRoleScope(grantedScope) === normalizeRoleScope(roleScope);
}

export function formatScopeAudience(scope: string | null | undefined): string {
  const decoded = decodeRoleScope(scope);
  if (!decoded) return scope?.trim() || '';
  return firstEnabledAccountKey(decoded.audience) ?? '';
}

