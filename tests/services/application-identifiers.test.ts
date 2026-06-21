import { describe, expect, it } from 'vitest';
import {
  buildApplicationId,
  buildAuthzEntityId,
  humanizeIdentifier,
  normalizeApplicationIdPrefix,
  slugifyAuthzTitle,
} from '@/services/applications/identifiers';
import { extractRolePermissionNames } from '@/services/access-model';

describe('application identifiers', () => {
  it('normalizes application prefixes to alphanumeric characters only', () => {
    expect(normalizeApplicationIdPrefix('Acme Portal_01')).toBe('AcmePortal01');
  });

  it('builds application ids with a fixed suffix shape', () => {
    expect(buildApplicationId('AcmePortal', 'abc123xyz')).toBe('AcmePortal.abc123xyz');
  });

  it('slugifies authz titles for deterministic ids', () => {
    expect(slugifyAuthzTitle('Orders Read / Write')).toBe('orders-read-write');
    expect(buildAuthzEntityId('AcmePortal.abc123xyz', 'Orders Read')).toBe(
      'AcmePortal.abc123xyz.orders-read',
    );
  });

  it('humanizes technical identifiers for display helpers', () => {
    expect(humanizeIdentifier('orders.read_only')).toBe('Orders Read Only');
  });
});

describe('role permission snapshots', () => {
  it('prefers permission ids when reading denormalized permission entries', () => {
    expect(
      extractRolePermissionNames([
        { id: 'AcmePortal.abc123xyz.orders-read', name: 'Orders Read' },
        'legacy.permission.name',
      ]),
    ).toEqual(['AcmePortal.abc123xyz.orders-read', 'legacy.permission.name']);
  });
});
