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
    expect(normalizeRoleScope('managed.0010')).toBe('managed.brand');
    expect(normalizeRoleScope('public.0001')).toBe('public.branch');
    expect(normalizeRoleScope('root.1000')).toBe('root.individual');
  });

  it('keeps legacy aliases backward compatible', () => {
    expect(expandRoleScope('managed')).toEqual([
      'managed.individual',
      'managed.dependent',
      'managed.brand',
      'managed.branch',
    ]);
    expect(expandRoleScope('brand.public')).toEqual(['public.brand']);
    expect(expandRoleScope('individual.root')).toEqual(['root.individual']);
  });

  it('encodes named scopes from selector audiences', () => {
    expect(
      encodeRoleScope('managed', {
        individual: false,
        dependent: false,
        brand: true,
        branch: false,
      }),
    ).toBe('managed.brand');
  });

  it('formats named scopes back to the legacy table display', () => {
    expect(formatRoleScopeForDisplay('managed.brand')).toBe('managed.0010');
    expect(formatRoleScopeForDisplay('public.branch')).toBe('public.0001');
    expect(formatRoleScopeForDisplay('root.individual')).toBe('root.1000');
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
      'managed.brand',
      'public.brand',
      'public.individual',
      'public.dependent',
      'public.branch',
    ]);
  });
});
