import { describe, expect, it } from 'vitest';
import {
  buildApplicationId,
  buildAuthzEntityId,
  camelCaseApplicationIdSegment,
  humanizeIdentifier,
  normalizeApplicationIdPrefix,
  normalizeApplicationIdSegment,
  slugifyAuthzTitle,
} from '@/services/applications/identifiers';
import { extractRolePermissionNames } from '@/services/access-model';

describe('application identifiers', () => {
  it('normalizes application prefixes to alphanumeric characters only', () => {
    expect(normalizeApplicationIdPrefix('Acme Portal_01')).toBe('acmeportal01');
  });

  it('builds application ids with a fixed suffix shape', () => {
    expect(buildApplicationId('AcmePortal', 'Abc123xyz')).toBe('acmeportal.abc123xyz');
  });

  it('builds lowercase application suffixes without special characters', () => {
    expect(camelCaseApplicationIdSegment('My sample app')).toBe('mysampleapp');
    expect(normalizeApplicationIdSegment('my Sample-App_01')).toBe('mysampleapp01');
  });

  it('slugifies authz titles for deterministic ids', () => {
    expect(slugifyAuthzTitle('Orders Read / Write')).toBe('orders-read-write');
    expect(buildAuthzEntityId('AcmePortal.abc123xyz', 'Orders Read')).toBe(
      'acmeportal.abc123xyz.orders-read',
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
