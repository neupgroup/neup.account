import { describe, expect, it } from 'vitest';
import {
  encodeRoleScope,
  expandRoleScope,
  formatRoleScopeForDisplay,
  getRoleAccessFlags,
  normalizeRoleScopes,
  getStoredRoleAccessPolicy,
  isKnownRoleScope,
  normalizeRoleScope,
} from '@/services/role-scopes';
import { normalizePermissionScopes } from '@/services/applications/permission-scopes';
import { roleMatchesAssignmentModesPolicy } from '@/services/applications/authz-scope-policy';

describe('role scope normalization', () => {
  it('uses named scopes as the canonical form', () => {
    expect(normalizeRoleScope('managed.0010')).toBe('acMgmt.brand');
    expect(normalizeRoleScope('public.0001')).toBe('acMgmt.subbrand');
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
        subbrand: false,
      }),
    ).toBe('acMgmt.brand');
  });

  it('formats scopes using the current canonical names', () => {
    expect(formatRoleScopeForDisplay('managed.brand')).toBe('acMgmt.brand');
    expect(formatRoleScopeForDisplay('public.branch')).toBe('acMgmt.subbrand');
    expect(formatRoleScopeForDisplay('root.individual')).toBe('rootMgmt.self');
  });

  it('normalizes and formats multiple role scopes from json arrays', () => {
    expect(normalizeRoleScopes(['managed.brand', 'public.branch'])).toEqual([
      'acMgmt.brand',
      'acMgmt.subbrand',
    ]);
    expect(formatRoleScopeForDisplay(['managed.brand', 'public.branch'])).toBe('acMgmt.brand, acMgmt.subbrand');
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

describe('authz scope policy account type matching', () => {
  it('allows default roles scoped for individual and dependent accounts only on those account types', () => {
    const input = {
      scopeFor: ['for_individual', 'for_dependent'],
      scopeLevel: 'assignable.byTeam',
      modes: ['manageable'] as const,
    };

    expect(roleMatchesAssignmentModesPolicy({ ...input, accountType: 'individual' })).toBe(true);
    expect(roleMatchesAssignmentModesPolicy({ ...input, accountType: 'dependent' })).toBe(true);
    expect(roleMatchesAssignmentModesPolicy({ ...input, accountType: 'brand' })).toBe(false);
    expect(roleMatchesAssignmentModesPolicy({ ...input, accountType: 'subbrand' })).toBe(false);
  });

  it('matches brand-scoped and subbrand-scoped roles only to covered account types', () => {
    expect(roleMatchesAssignmentModesPolicy({
      accountType: 'brand',
      scopeFor: ['for_brand'],
      scopeLevel: 'assignable.byTeam',
      modes: ['manageable'],
    })).toBe(true);
    expect(roleMatchesAssignmentModesPolicy({
      accountType: 'subbrand',
      scopeFor: ['for_brand'],
      scopeLevel: 'assignable.byTeam',
      modes: ['manageable'],
    })).toBe(false);
    expect(roleMatchesAssignmentModesPolicy({
      accountType: 'subbrand',
      scopeFor: ['for_brand', 'for_subBrand'],
      scopeLevel: 'assignable.byTeam',
      modes: ['manageable'],
    })).toBe(true);
  });
});

describe('role access flag mapping', () => {
  it('maps persisted role policies into the new access flags', () => {
    expect(getRoleAccessFlags('assignment', 'none')).toMatchObject({ assignable: true });
    expect(getRoleAccessFlags('public_request', 'none')).toMatchObject({ publiclyEnrollable: true });
    expect(getRoleAccessFlags('system_generated', 'none')).toMatchObject({ assignable: true });
    expect(getRoleAccessFlags('invitation', 'none')).toMatchObject({ rootAssigned: true });
    expect(getRoleAccessFlags('public_request', 'approval_required')).toMatchObject({ publiclyRequestable: true });
    expect(getRoleAccessFlags('invitation', 'approval_required')).toMatchObject({ requestableToOwner: true });
  });

  it('stores the new flag payloads with backward-compatible legacy columns', () => {
    expect(getStoredRoleAccessPolicy({ assignable: true })).toMatchObject({
      acquisitionType: 'assignment',
      approvalPolicy: 'none',
    });
    expect(getStoredRoleAccessPolicy({ publiclyEnrollable: true })).toMatchObject({
      acquisitionType: 'public_request',
      approvalPolicy: 'none',
    });
    expect(getStoredRoleAccessPolicy({ publiclyRequestable: true })).toMatchObject({
      acquisitionType: 'public_request',
      approvalPolicy: 'approval_required',
    });
    expect(getStoredRoleAccessPolicy({ requestableToOwner: true })).toMatchObject({
      acquisitionType: 'invitation',
      approvalPolicy: 'approval_required',
    });
  });
});
