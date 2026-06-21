export const ROLE_SCOPE_MODES = ['managed', 'public', 'toApprove', 'root'] as const;

export type RoleAssignmentMode = 'manageable' | 'public' | 'toApprove' | 'root';
export type ScopeMode = (typeof ROLE_SCOPE_MODES)[number];
export type ScopeAccountKey = 'individual' | 'dependent' | 'brand' | 'branch';
export type ScopeAudience = Record<ScopeAccountKey, boolean>;
export type RoleScope = string;

const CANONICAL_SCOPE_PATTERN = /^(managed|public|toApprove|root)\.(individual|dependent|brand|branch)$/;
const LEGACY_BITMASK_SCOPE_PATTERN = /^(managed|public|toApprove|root)\.([01]{4})$/;
const LEGACY_ENCODED_SCOPE_PATTERN =
  /^(managable|managed|public|toApprove|root)\.i([01])([01])b([01])([01])$/;

const ACCOUNT_KEYS: ScopeAccountKey[] = ['individual', 'dependent', 'brand', 'branch'];
const SCOPE_AUDIENCE_LABELS: Record<ScopeAccountKey, string> = {
  individual: 'individual',
  dependent: 'dependent',
  brand: 'brand',
  branch: 'branch',
};
const ACCOUNT_BITS: Record<ScopeAccountKey, string> = {
  individual: '1000',
  dependent: '0100',
  brand: '0010',
  branch: '0001',
};

function canonicalScope(mode: ScopeMode, accountKey: ScopeAccountKey): string {
  return `${mode}.${mode === 'root' ? 'individual' : accountKey}`;
}

const LEGACY_SCOPE_MAP: Record<string, string[]> = {
  root: [canonicalScope('root', 'individual')],
  'individual.root': [canonicalScope('root', 'individual')],
  public: ACCOUNT_KEYS.map((key) => canonicalScope('public', key)),
  default: [canonicalScope('public', 'individual')],
  application: ACCOUNT_KEYS.map((key) => canonicalScope('public', key)),
  brand: [canonicalScope('managed', 'brand')],
  managed: ACCOUNT_KEYS.map((key) => canonicalScope('managed', key)),
  manageable: ACCOUNT_KEYS.map((key) => canonicalScope('managed', key)),
  managable: ACCOUNT_KEYS.map((key) => canonicalScope('managed', key)),
  toApprove: ACCOUNT_KEYS.map((key) => canonicalScope('toApprove', key)),
  'brand.managable': [canonicalScope('managed', 'brand')],
  'branch.brand.managable': [canonicalScope('managed', 'branch')],
  'individual.managable': [canonicalScope('managed', 'individual')],
  'dependent.individual.managable': [canonicalScope('managed', 'dependent')],
  'individual.public': [canonicalScope('public', 'individual')],
  'brand.public': [canonicalScope('public', 'brand')],
  'branch.brand.public': [canonicalScope('public', 'branch')],
  'dependent.individual.public': [canonicalScope('public', 'dependent')],
  'individual.toApprove': [canonicalScope('toApprove', 'individual')],
  'dependent.individual.toApprove': [canonicalScope('toApprove', 'dependent')],
  'brand.toApprove': [canonicalScope('toApprove', 'brand')],
  'branch.brand.toApprove': [canonicalScope('toApprove', 'branch')],
};

const ROLE_SCOPE_SET = new Set<string>(
  ROLE_SCOPE_MODES.flatMap((mode) =>
    mode === 'root'
      ? [canonicalScope('root', 'individual')]
      : ACCOUNT_KEYS.map((key) => canonicalScope(mode, key)),
  ),
);

function normalizeMode(mode: string): ScopeMode | null {
  const normalized = mode.trim();
  if (normalized === 'managable') return 'managed';
  if (normalized === 'manageable') return 'managed';
  return ROLE_SCOPE_MODES.includes(normalized as ScopeMode) ? (normalized as ScopeMode) : null;
}

function audienceFromAccountKey(accountKey: ScopeAccountKey): ScopeAudience {
  return {
    individual: accountKey === 'individual',
    dependent: accountKey === 'dependent',
    brand: accountKey === 'brand',
    branch: accountKey === 'branch',
  };
}

function firstEnabledAccountKey(audience: ScopeAudience): ScopeAccountKey | null {
  return ACCOUNT_KEYS.find((key) => audience[key]) ?? null;
}

function bitsToAccountKeys(bits: string): ScopeAccountKey[] {
  return ACCOUNT_KEYS.filter((key, index) => bits[index] === '1');
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
  const accountKey = firstEnabledAccountKey(audience) ?? 'individual';
  return canonicalScope(mode, accountKey);
}

export function expandRoleScope(scope: string | null | undefined): string[] {
  const normalized = (scope ?? '').trim();
  if (!normalized) return [];

  const canonicalMatch = CANONICAL_SCOPE_PATTERN.exec(normalized);
  if (canonicalMatch) {
    const mode = normalizeMode(canonicalMatch[1]);
    const accountKey = canonicalMatch[2] as ScopeAccountKey;
    if (!mode) return [];
    if (mode === 'root') return accountKey === 'individual' ? [canonicalScope('root', 'individual')] : [];
    return [canonicalScope(mode, accountKey)];
  }

  const bitmaskMatch = LEGACY_BITMASK_SCOPE_PATTERN.exec(normalized);
  if (bitmaskMatch) {
    const mode = normalizeMode(bitmaskMatch[1]);
    if (!mode) return [];
    if (mode === 'root') return bitmaskMatch[2] === '1000' ? [canonicalScope('root', 'individual')] : [];
    return bitsToAccountKeys(bitmaskMatch[2]).map((accountKey) => canonicalScope(mode, accountKey));
  }

  const legacyEncodedMatch = LEGACY_ENCODED_SCOPE_PATTERN.exec(normalized);
  if (legacyEncodedMatch) {
    const mode = normalizeMode(legacyEncodedMatch[1]);
    if (!mode) return [];
    if (mode === 'root') return [canonicalScope('root', 'individual')];
    const bits = `${legacyEncodedMatch[2]}${legacyEncodedMatch[3]}${legacyEncodedMatch[4]}${legacyEncodedMatch[5]}`;
    return bitsToAccountKeys(bits).map((accountKey) => canonicalScope(mode, accountKey));
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

  const match = CANONICAL_SCOPE_PATTERN.exec(normalized);
  if (!match) return null;

  const mode = normalizeMode(match[1]);
  const accountKey = match[2] as ScopeAccountKey;
  if (!mode) return null;

  return {
    mode,
    normalized,
    audience: audienceFromAccountKey(accountKey),
  };
}

export function isKnownRoleScope(scope: string): scope is RoleScope {
  const normalized = normalizeRoleScope(scope);
  return normalized !== null && ROLE_SCOPE_SET.has(normalized);
}

export function roleScopeError() {
  return 'Role scope must use managed, public, toApprove, or root with a named audience like managed.brand.';
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
    return normalizedAccountType === 'individual' ? canonicalScope('root', 'individual') : null;
  }

  if (normalizedAccountType === 'other') return null;
  return canonicalScope(normalizedMode, normalizedAccountType);
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
  return normalizeRoleScope(scope) === canonicalScope('root', 'individual');
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

export function formatRoleScopeForDisplay(scope: string | null | undefined): string {
  const normalized = normalizeRoleScope(scope);
  if (!normalized) return scope?.trim() || '';

  const decoded = decodeRoleScope(normalized);
  if (!decoded) return normalized;

  const accountKey = firstEnabledAccountKey(decoded.audience);
  if (!accountKey) return normalized;
  return `${decoded.mode}.${ACCOUNT_BITS[accountKey]}`;
}

export function formatMergedScopeLabels(
  scopes: Array<string | null | undefined>,
): string[] {
  const grouped = new Map<ScopeMode, Set<string>>();

  for (const scope of scopes) {
    const expandedScopes = expandRoleScope(scope);
    for (const expandedScope of expandedScopes) {
      const decoded = decodeRoleScope(expandedScope);
      if (!decoded) continue;

      const audienceKey = firstEnabledAccountKey(decoded.audience);
      if (!audienceKey) continue;

      const labels = grouped.get(decoded.mode) ?? new Set<string>();
      labels.add(SCOPE_AUDIENCE_LABELS[audienceKey]);
      grouped.set(decoded.mode, labels);
    }
  }

  return ROLE_SCOPE_MODES
    .filter((mode) => grouped.has(mode))
    .map((mode) => {
      const labels = Array.from(grouped.get(mode) ?? []).sort((a, b) => a.localeCompare(b));
      return `${mode}(${labels.join(',')})`;
    });
}
