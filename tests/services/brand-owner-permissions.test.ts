import { describe, expect, it } from 'vitest';
import { BRAND_OWNER_PERMISSION_NAMES } from '@/neup.core/auth/brand-roles';
import { hasAnyPermission } from '@/neup.core/auth/profile-permissions';
import {
  NEUP_ACCOUNT_PERMISSION_DEFINITIONS,
  resolveNeupAccountPermissionCandidates,
} from '@/services/neup-account/permission-catalog';

describe('brand owner permissions', () => {
  it('uses managed permissions for managed account features', () => {
    expect(BRAND_OWNER_PERMISSION_NAMES).toEqual(
      expect.arrayContaining([
        'notification.read.managed',
        'access.view.managed',
        'access.team.view.managed',
        'application.view.managed',
      ]),
    );
  });

  it('does not include root-audience permissions', () => {
    expect(BRAND_OWNER_PERMISSION_NAMES.some((permission) => permission.endsWith('.root'))).toBe(false);
  });

  it('registers managed notification permissions in the catalog', () => {
    expect(
      NEUP_ACCOUNT_PERMISSION_DEFINITIONS.some(
        (permission) => permission.name === 'notification.read.managed',
      ),
    ).toBe(true);
  });
});

describe('selected account permission matching', () => {
  it('maps current-account self requirements to managed grants', () => {
    expect(hasAnyPermission(['access.view.managed'], ['access.view.self'])).toBe(true);
    expect(hasAnyPermission(['notification.read.managed'], ['notification.read.self'])).toBe(true);
  });

  it('does not map root requirements to managed grants', () => {
    expect(hasAnyPermission(['application.view.managed'], ['application.view.root'])).toBe(false);
    expect(resolveNeupAccountPermissionCandidates('application.view.root', 'managed')).toEqual([
      'application.view.root',
    ]);
  });
});
