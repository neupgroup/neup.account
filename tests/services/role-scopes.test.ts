import { describe, expect, it } from 'vitest';
import {
  encodeRoleScope,
  expandRoleScope,
  formatRoleScopeForDisplay,
  isKnownRoleScope,
  normalizeRoleScope,
} from '@/services/role-scopes';
import { normalizePermissionScopes } from '@/services/applications/permission-scopes';

describe('role scope normalization', () => {
  it('uses named scopes as the canonical form', () => {
    expect(normalizeRoleScope('managed.0010')).toBe('acMgmt.brand');
    expect(normalizeRoleScope('public.0001')).toBe('acMgmt.branch');
    expect(normalizeRoleScope('root.1000')).toBe('rootMgmt.self');
  });

  it('keeps legacy aliases backward compatible', () => {
    expect(expandRoleScope('managed')).toEqual(['acMgmt.self']);
    expect(expandRoleScope('brand.public')).toEqual(['acMgmt.brand']);
    expect(expandRoleScope('individual.root')).toEqual(['rootMgmt.self']);
  });

  it('encodes named scopes from selector audiences', () => {
    expect(
      encodeRoleScope('acMgmt', {
        individual: false,
        dependent: false,
        brand: true,
        branch: false,
      }),
    ).toBe('acMgmt.brand');
  });

  it('formats scopes using the current canonical names', () => {
    expect(formatRoleScopeForDisplay('managed.brand')).toBe('acMgmt.brand');
    expect(formatRoleScopeForDisplay('public.branch')).toBe('acMgmt.branch');
    expect(formatRoleScopeForDisplay('root.individual')).toBe('rootMgmt.self');
  });

  it('validates named scopes as known role scopes', () => {
    expect(isKnownRoleScope('managed.brand')).toBe(true);
    expect(isKnownRoleScope('managed.0010')).toBe(true);
    expect(isKnownRoleScope('managed.0000')).toBe(false);
  });
});

describe('permission scope normalization', () => {
  it('normalizes permission scope arrays into named scopes', () => {
    expect(normalizePermissionScopes(['managed.0010', 'public.brand', 'public'])).toEqual([
      'acMgmt.brand',
      'acMgmt.self',
    ]);
  });
});
