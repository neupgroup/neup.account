import { describe, expect, it } from 'vitest';
import { BRAND_OWNER_PERMISSION_NAMES } from '@/inapp/permissions/brand-roles';
import { hasAnyPermission } from '@/inapp/permissions/profile-permissions';
import {
  NEUP_ACCOUNT_PERMISSION_DEFINITIONS,
  resolveNeupAccountPermissionCandidates,
} from '@/inapp/permissions/permission-catalog';

describe('brand owner permissions', () => {
  it('uses unsuffixed permissions for managed account features', () => {
    expect(BRAND_OWNER_PERMISSION_NAMES).toEqual(
      expect.arrayContaining([
        'notification.read',
        'access.view',
        'access.team.view',
        'application.view',
      ]),
    );
  });

  it('does not include audience suffix permissions', () => {
    expect(BRAND_OWNER_PERMISSION_NAMES.some((permission) => /\.(managed|root|self)$/.test(permission))).toBe(false);
  });

  it('registers notification permissions in the catalog', () => {
    expect(
      NEUP_ACCOUNT_PERMISSION_DEFINITIONS.some(
        (permission) => permission.name === 'notification.read',
      ),
    ).toBe(true);
  });
});

describe('selected account permission matching', () => {
  it('maps current-account self requirements to managed grants', () => {
    expect(hasAnyPermission(['access.view'], ['access.view.self'])).toBe(true);
    expect(hasAnyPermission(['notification.read'], ['notification.read.self'])).toBe(true);
  });

  it('does not map root requirements to managed grants', () => {
    expect(hasAnyPermission(['application.view'], ['application.view.root'])).toBe(true);
    expect(resolveNeupAccountPermissionCandidates('application.view.root', 'managed')).toEqual([
      'application.view',
      'application.view.root',
      'application.view.managed',
    ]);
  });
});
