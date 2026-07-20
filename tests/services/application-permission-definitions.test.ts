import { describe, expect, it } from 'vitest';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';

const APPLICATION_ACCOUNT_MANAGEMENT_PERMISSION_NAMES = [
  'application.account.view',
  'application.account.delete',
  'application.account.role.update',
  'application.account.profile.update',
  'application.account.connection.assign',
];

describe('application system owner permissions', () => {
  it('excludes application.create from the system owner role', () => {
    expect(
      APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.some(
        (permission) => permission.name === 'application.create',
      ),
    ).toBe(true);

    expect(
      APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS.some(
        (permission) => permission.name === 'application.create',
      ),
    ).toBe(false);
  });

  it('marks public, managed, and root permissions with scope_for and scope_level', () => {
    const publicView = APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.find(
      (permission) => permission.name === 'application.view',
    );
    const rootView = APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.find(
      (permission) => permission.name === ROOT_APPLICATION_VIEW_PERMISSION,
    );

    expect(publicView).toMatchObject({
      scopeFor: ['for_individual'],
      scopeLevel: ['assignable.toSelf.publicly', 'assignable.byTeam', 'assignable.byRoot'],
    });
    expect(rootView).toMatchObject({
      scopeFor: ['for_individual'],
      scopeLevel: ['assignable.toSelf.publicly', 'assignable.byTeam', 'assignable.byRoot'],
    });
  });

  it('defines application account-management permissions for individual, dependent, and root-managed sets', () => {
    for (const permissionName of APPLICATION_ACCOUNT_MANAGEMENT_PERMISSION_NAMES) {
      expect(
        APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.find(
          (permission) => permission.name === permissionName,
        ),
      ).toMatchObject({
        scopeFor: ['for_individual', 'for_dependent'],
        scopeLevel: ['assignable.toSelf.publicly', 'assignable.byTeam', 'assignable.byRoot'],
      });
    }
  });

  it('defines application user basic updates for all account scopes and acquisition levels', () => {
    expect(
      APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.find(
        (permission) => permission.name === 'application.user.updateBasics',
      ),
    ).toMatchObject({
      scopeFor: ['for_brand', 'for_individual', 'for_dependent', 'for_subBrand', 'for_guest'],
      scopeLevel: [
        'assignable.byTeam',
        'assignable.toSelf.publicly',
        'assignable.toSelf.publicly.byRequest',
        'assignable.byTeam.fromRequest',
        'assignable.byRoot',
      ],
    });
  });
});
