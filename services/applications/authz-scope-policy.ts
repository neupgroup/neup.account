/*
::neup.documentation::application-authz-scope-policy
::title Application Authz Scope Policy Helpers

Normalizes the `scope_for` and `scope_level` fields used by application roles and permissions.

::public

This module is the source of truth for the allowed `scope_for` and `scope_level` values, storage normalization, and role-permission compatibility expansion.

::public end

::private

The runtime still keeps the legacy `acquisition_type` and `approval_policy` columns for compatibility, but those values are derived from `scope_level` here.

::private end

::end
*/

export const AUTHZ_SCOPE_FOR_VALUES = [
  'for_brand',
  'for_individual',
  'for_dependent',
  'for_subBrand',
  'for_guest',
] as const;

export const AUTHZ_SCOPE_LEVEL_VALUES = [
  'assignable.byTeam',
  'assignable.toSelf.publicly',
  'assignable.toSelf.publicly.byRequest',
  'assignable.byTeam.fromRequest',
  'assignable.byRoot',
] as const;

export type AuthzScopeFor = (typeof AUTHZ_SCOPE_FOR_VALUES)[number];
export type AuthzScopeLevel = (typeof AUTHZ_SCOPE_LEVEL_VALUES)[number];
export type AuthzAssignableScopeLevel = AuthzScopeLevel | 'manageable' | 'managable';

type LegacyStoredPolicy = {
  acquisitionType: string;
  approvalPolicy: string;
};

export const AUTHZ_SCOPE_FOR_META: Record<AuthzScopeFor, { label: string; description: string }> = {
  for_brand: {
    label: 'for_brand',
    description: 'Applies to brand accounts.',
  },
  for_individual: {
    label: 'for_individual',
    description: 'Applies to individual accounts.',
  },
  for_dependent: {
    label: 'for_dependent',
    description: 'Applies to dependent accounts.',
  },
  for_subBrand: {
    label: 'for_subBrand',
    description: 'Applies to subBrand accounts.',
  },
  for_guest: {
    label: 'for_guest',
    description: 'Applies to guest accounts.',
  },
};

export const AUTHZ_SCOPE_LEVEL_META: Record<AuthzScopeLevel, { label: string; description: string }> = {
  'assignable.byTeam': {
    label: 'assignable.byTeam',
    description: 'Can be assigned directly.',
  },
  'assignable.toSelf.publicly': {
    label: 'assignable.toSelf.publicly',
    description: 'Can be enrolled publicly without approval.',
  },
  'assignable.toSelf.publicly.byRequest': {
    label: 'assignable.toSelf.publicly.byRequest',
    description: 'Can be requested publicly and approved by an admin.',
  },
  'assignable.byTeam.fromRequest': {
    label: 'assignable.byTeam.fromRequest',
    description: 'Can be requested and approved by the owner.',
  },
  'assignable.byRoot': {
    label: 'assignable.byRoot',
    description: 'Can only be assigned by root management.',
  },
};

function isKnownScopeFor(value: string): value is AuthzScopeFor {
  return AUTHZ_SCOPE_FOR_VALUES.includes(value as AuthzScopeFor);
}

function isKnownScopeLevel(value: string): value is AuthzScopeLevel {
  return AUTHZ_SCOPE_LEVEL_VALUES.includes(value as AuthzScopeLevel);
}

function normalizeLegacyScopeLevelValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'assignable' || trimmed === 'selfAssigned') return 'assignable.byTeam';
  if (trimmed === 'assignable.publicly') return 'assignable.toSelf.publicly';
  if (trimmed === 'assignable.publicly.byRequest') return 'assignable.toSelf.publicly.byRequest';
  if (trimmed === 'publiclyEnrollable') return 'assignable.toSelf.publicly';
  if (trimmed === 'publiclyRequestable') return 'assignable.toSelf.publicly.byRequest';
  if (trimmed === 'requestableToOwner' || trimmed === 'requestToOwner') return 'assignable.byTeam.fromRequest';
  if (trimmed === 'rootAssigned' || trimmed === 'rootManaged') return 'assignable.byRoot';
  return trimmed;
}

export function normalizeAuthzScopeFor(value: unknown, allowMultiple = true): AuthzScopeFor[] {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = Array.from(
    new Set(
      rawValues
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(isKnownScopeFor),
    ),
  );

  if (allowMultiple) return normalized;
  return normalized.length > 0 ? [normalized[0]] : [];
}

export function normalizeAuthzScopeLevels(value: unknown, allowMultiple = true): AuthzScopeLevel[] {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = Array.from(
    new Set(
      rawValues
        .map((item) => (typeof item === 'string' ? normalizeLegacyScopeLevelValue(item) : ''))
        .filter(isKnownScopeLevel),
    ),
  );

  if (allowMultiple) return normalized;
  return normalized.length > 0 ? [normalized[0]] : [];
}

export function normalizeSingleAuthzScopeLevel(value: unknown): AuthzScopeLevel {
  return normalizeAuthzScopeLevels(value, false)[0] ?? 'assignable.byTeam';
}

export function normalizeAssignableScopeLevel(value: unknown): AuthzScopeLevel {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized === 'manageable' || normalized === 'managable') {
    return 'assignable.byTeam';
  }

  return normalizeSingleAuthzScopeLevel(value);
}

export function scopeForForAccountType(accountType: string | null | undefined): AuthzScopeFor | null {
  const normalized = (accountType ?? '').trim().toLowerCase();

  if (normalized === 'brand') return 'for_brand';
  if (normalized === 'branch' || normalized === 'subbrand') return 'for_subBrand';
  if (normalized === 'dependent') return 'for_dependent';
  if (normalized === 'individual') return 'for_individual';
  if (normalized === 'guest') return 'for_guest';
  return null;
}

export function deriveLegacyRoleScopesFromPolicy(
  scopeFor: readonly AuthzScopeFor[],
  scopeLevel: AuthzScopeLevel,
): string[] {
  if (scopeLevel === 'assignable.byRoot' && scopeFor.includes('for_individual')) {
    return ['rootMgmt.self'];
  }
  if (scopeFor.includes('for_brand') && scopeFor.includes('for_subBrand')) {
    return ['acMgmt.brandSubbrand'];
  }
  if (scopeFor.includes('for_subBrand')) {
    return ['acMgmt.subbrand'];
  }
  if (scopeFor.includes('for_brand')) {
    return ['acMgmt.brand'];
  }

  return ['acMgmt.self'];
}

export function roleMatchesAssignmentModesPolicy(input: {
  accountType: string | null | undefined;
  scopeFor: unknown;
  scopeLevel: unknown;
  modes: readonly ('manageable' | 'public' | 'toApprove' | 'root')[];
}): boolean {
  const requiredScopeFor = scopeForForAccountType(input.accountType);
  if (!requiredScopeFor) return false;

  const roleScopeFor = normalizeAuthzScopeFor(input.scopeFor);
  const roleScopeLevel = normalizeAssignableScopeLevel(input.scopeLevel);
  if (!roleScopeFor.includes(requiredScopeFor)) return false;

  if (roleScopeLevel === 'assignable.byRoot') {
    return input.modes.includes('root');
  }

  return input.modes.some((mode) => mode === 'manageable' || mode === 'public' || mode === 'toApprove');
}

export function roleMatchesAccountTypeScopePolicy(input: {
  accountType: string | null | undefined;
  scopeFor: unknown;
  scopeLevel: unknown;
  requiredScopeLevel: AuthzAssignableScopeLevel;
}): boolean {
  const requiredScopeFor = scopeForForAccountType(input.accountType);
  if (!requiredScopeFor) return false;

  const roleScopeFor = normalizeAuthzScopeFor(input.scopeFor);
  const roleScopeLevel = normalizeAssignableScopeLevel(input.scopeLevel);
  const requiredScopeLevel = normalizeAssignableScopeLevel(input.requiredScopeLevel);

  return roleScopeFor.includes(requiredScopeFor) && roleScopeLevel === requiredScopeLevel;
}

export function getStoredPolicyForScopeLevel(scopeLevel: AuthzScopeLevel): LegacyStoredPolicy {
  switch (scopeLevel) {
    case 'assignable.byTeam.fromRequest':
      return { acquisitionType: 'invitation', approvalPolicy: 'approval_required' };
    case 'assignable.byRoot':
      return { acquisitionType: 'invitation', approvalPolicy: 'none' };
    case 'assignable.toSelf.publicly.byRequest':
      return { acquisitionType: 'public_request', approvalPolicy: 'approval_required' };
    case 'assignable.toSelf.publicly':
      return { acquisitionType: 'public_request', approvalPolicy: 'none' };
    case 'assignable.byTeam':
    default:
      return { acquisitionType: 'assignment', approvalPolicy: 'none' };
  }
}

export function getScopeLevelsFromStoredPolicy(
  acquisitionType: string | null | undefined,
  approvalPolicy: string | null | undefined,
): AuthzScopeLevel[] {
  if (acquisitionType === 'system_generated') return ['assignable.byTeam'];
  if (acquisitionType === 'invitation' && approvalPolicy === 'approval_required') return ['assignable.byTeam.fromRequest'];
  if (acquisitionType === 'invitation') return ['assignable.byRoot'];
  if (acquisitionType === 'public_request' && approvalPolicy === 'approval_required') return ['assignable.toSelf.publicly.byRequest'];
  if (acquisitionType === 'public_request') return ['assignable.toSelf.publicly'];
  return ['assignable.byTeam'];
}

export function expandAuthzScopePairs(
  scopeFor: readonly AuthzScopeFor[],
  scopeLevels: readonly AuthzScopeLevel[],
): Array<{ scopeFor: AuthzScopeFor; scopeLevel: AuthzScopeLevel }> {
  const pairs: Array<{ scopeFor: AuthzScopeFor; scopeLevel: AuthzScopeLevel }> = [];

  for (const nextScopeFor of scopeFor) {
    for (const nextScopeLevel of scopeLevels) {
      pairs.push({ scopeFor: nextScopeFor, scopeLevel: nextScopeLevel });
    }
  }

  return pairs;
}

export function getCompatibleRolePermissionScopePairs(input: {
  roleScopeFor: readonly AuthzScopeFor[];
  roleScopeLevel: AuthzScopeLevel;
  permissionScopeFor: readonly AuthzScopeFor[];
  permissionScopeLevels: readonly AuthzScopeLevel[];
}): Array<{ scopeFor: AuthzScopeFor; scopeLevel: AuthzScopeLevel }> {
  const allowedScopeFor = input.roleScopeFor.filter((value) => input.permissionScopeFor.includes(value));
  const allowedScopeLevels = input.permissionScopeLevels.includes(input.roleScopeLevel)
    ? [input.roleScopeLevel]
    : [];

  return expandAuthzScopePairs(allowedScopeFor, allowedScopeLevels);
}
