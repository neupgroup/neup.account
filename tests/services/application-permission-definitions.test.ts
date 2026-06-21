import { describe, expect, it } from 'vitest';
import {
  APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS,
  APPLICATION_SYSTEM_OWNER_PERMISSION_DEFINITIONS,
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
});
