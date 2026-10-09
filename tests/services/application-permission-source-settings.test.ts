import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    application: { findUnique: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    authzPermission: { findMany: vi.fn(), upsert: vi.fn() },
    authzRole: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    authzRolePermissionMap: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    role: { updateMany: vi.fn() },
    access: { findMany: vi.fn() },
    $queryRaw: vi.fn(), $transaction: vi.fn(),
  },
  root: vi.fn(),
}));
vi.mock('@neup/core/database/prisma', async () => ({ default: mocks.db, Prisma: (await import('@/prisma/client')).Prisma }));
vi.mock('@neup/logica/permission', () => ({ permission: vi.fn() }));
vi.mock('@neup/logica/logger/files', () => ({ logError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/services/account/verify', () => ({ getActiveAccountId: async () => 'viewer', getPersonalAccountId: async () => 'viewer' }));
vi.mock('@/services/applications/manage', () => ({ hasRootApplicationPermission: mocks.root }));
vi.mock('@/services/applications/authz-webhook', () => ({ dispatchAuthzWebhook: vi.fn() }));
vi.mock('@/services/applications/role-update-events', () => ({ dispatchRoleUpdateWebhook: vi.fn(), getRolePayload: vi.fn() }));
vi.mock('@/services/access-model', () => ({ activeAccessWhere: () => ({ status: 'active' }) }));
vi.mock('@/services/applications/authz-scope-policy-columns', () => ({
  getAuthzScopePolicyColumnSupport: async () => ({ permission: true, role: true, rolePermissionMap: true }),
  isMissingAuthzScopePolicyColumnError: () => false,
}));
import { getAppPermissionSourceSettings, updateAppPermissionSource } from '@/services/applications/authz-manage';
import { APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS } from '@/services/applications/permission-definitions';
import { getStoredPolicyForScopeLevel } from '@/services/applications/authz-scope-policy';

const { db } = mocks;
let permissions: any[];
let roles: any[];
let mappings: any[];

beforeEach(() => {
  vi.clearAllMocks();
  permissions = []; roles = []; mappings = [];
  mocks.root.mockResolvedValue(true);
  db.application.findUnique.mockResolvedValue({ usePermissionFrom: null, permissionSource: null });
  db.application.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({ id: `app-${index}`, name: `App ${index}` })));
  db.access.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.$queryRaw.mockImplementation(async () => {
    permissions = APPLICATION_PUBLIC_MANAGED_AND_ROOT_PERMISSION_DEFINITIONS.map((definition, index) => ({
      ...definition, id: `existing-${index}`, approvalPolicy: getStoredPolicyForScopeLevel(definition.scopeLevel[0]).approvalPolicy,
    }));
    return permissions.map(({ id, name }) => ({ id, name }));
  });
  db.authzPermission.findMany.mockImplementation(async ({ where }) => where.id ? permissions.filter((p) => where.id.in.includes(p.id)) : permissions);
  db.authzRole.findMany.mockImplementation(async () => roles);
  db.authzRole.findFirst.mockImplementation(async ({ where }) => roles.find((role) => role.id === where.id));
  db.authzRole.upsert.mockImplementation(async ({ where, create, update }) => {
    const existing = roles.find((role) => role.id === where.id);
    if (existing) Object.assign(existing, update); else roles.push({ ...create });
  });
  db.authzRole.update.mockImplementation(async ({ where, data }) => Object.assign(roles.find((role) => role.id === where.id), data));
  db.authzRolePermissionMap.findMany.mockImplementation(async ({ where, select }) => {
    const rows = mappings.filter((row) => typeof where.roleId === 'string' ? row.roleId === where.roleId : where.roleId.in.includes(row.roleId));
    return select.permission ? rows.map((row) => ({ ...row, permission: permissions.find((p) => p.id === row.permissionId) })) : rows;
  });
  db.authzRolePermissionMap.deleteMany.mockImplementation(async ({ where }) => { mappings = mappings.filter((row) => row.roleId !== where.roleId); });
  db.authzRolePermissionMap.createMany.mockImplementation(async ({ data }) => { mappings.push(...data); });
});

describe('permission source settings database work', () => {
  it('initializes once for 100 candidates, using one permission upsert statement', async () => {
    const result = await getAppPermissionSourceSettings('target');
    expect(result?.applications).toHaveLength(100);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.authzPermission.upsert).not.toHaveBeenCalled();
    expect(db.access.findMany).not.toHaveBeenCalled();
  });

  it('only queries independent source applications, excluding the current app', async () => {
    await getAppPermissionSourceSettings('target');
    expect(db.application.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { not: 'target' }, usePermissionFrom: null },
    }));
  });

  it.each([null, 'dependent'])('rejects a dependent source even if it is already selected (%s)', async (currentSource) => {
    db.application.findUniqueOrThrow.mockImplementation(async ({ where }) => ({
      id: where.id, usePermissionFrom: where.id === 'target' ? currentSource : 'main',
    }));
    const result = await updateAppPermissionSource('target', 'dependent');
    expect(result).toEqual({ success: false, error: 'Choose an application that defines its own permissions.' });
    expect(db.application.update).not.toHaveBeenCalled();
  });

  it('recognizes initialized scope-compatible roles without rebuilding on the next request', async () => {
    await getAppPermissionSourceSettings('target');
    await getAppPermissionSourceSettings('target');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('shares setup between concurrent page requests', async () => {
    await Promise.all(Array.from({ length: 5 }, () => getAppPermissionSourceSettings('target')));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('retries setup after a failed transaction', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('transaction failed'));
    await expect(getAppPermissionSourceSettings('target')).rejects.toThrow('transaction failed');
    await expect(getAppPermissionSourceSettings('target')).resolves.not.toBeNull();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('still requires source visibility when the account has only root management permission', async () => {
    mocks.root.mockImplementation(async (name) => name === 'application.roles.manage');
    db.access.findMany.mockImplementation(async ({ where }) => typeof where.accessApplicationId === 'string'
      ? [{ role: { permissions: ['application.roles.view'] } }]
      : [{ accessApplicationId: 'app-2', role: { permissions: ['application.roles.view'] } }]);
    const result = await getAppPermissionSourceSettings('target');
    expect(result?.applications.map((app) => app.id)).toEqual(['app-2']);
  });

  it('does not list source apps when the target cannot be viewed', async () => {
    mocks.root.mockResolvedValue(false);
    const result = await getAppPermissionSourceSettings('target');
    expect(result).toBeNull();
    expect(db.application.findMany).not.toHaveBeenCalled();
  });

  it('filters all candidates in one scoped access query and excludes view-only grants', async () => {
    mocks.root.mockResolvedValue(false);
    db.access.findMany.mockImplementation(async ({ where }) => typeof where.accessApplicationId === 'string'
      ? [{ role: { permissions: ['application.roles.view'] } }]
      : [
        { accessApplicationId: 'app-1', role: { permissions: ['application.roles.manage'] } },
        { accessApplicationId: 'app-2', role: { permissions: ['application.roles.view'] } },
        { accessApplicationId: 'app-3', role: { permissions: null } },
      ]);
    const result = await getAppPermissionSourceSettings('target');
    expect(result?.applications.map((app) => app.id)).toEqual(['app-1']);
    expect(db.access.findMany).toHaveBeenCalledTimes(2); // Target view + all source grants.
    expect(db.access.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ memberAccountId: 'viewer', status: 'active', accessApplicationId: { in: expect.any(Array) } }),
    }));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
