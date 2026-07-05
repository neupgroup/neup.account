import { describe, expect, it } from 'vitest';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
  ROOT_APPLICATION_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';

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
      scopeLevel: ['publiclyEnrollable', 'assignable', 'rootManaged'],
    });
    expect(rootView).toMatchObject({
      scopeFor: ['for_individual'],
      scopeLevel: ['publiclyEnrollable', 'assignable', 'rootManaged'],
    });
  });
});
