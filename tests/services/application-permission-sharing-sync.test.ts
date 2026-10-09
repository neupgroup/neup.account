import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  application: { findUnique: vi.fn() },
  authzPermission: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
  authzRole: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  role: { updateMany: vi.fn() },
  authzRolePermissionMap: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@neup/core/database/prisma', () => ({ default: db, Prisma: { JsonNull: null } }));
vi.mock('@neup/logica/logger/files', () => ({ logError: vi.fn() }));
import { getSyncedAppPermissions, postSyncedAppPermissions, postSyncedAppRoles } from '@/services/bridge/app-authz-sync';
const credentials = { neupAppId: 'consumer', neupAppSecret: 'secret' };

beforeEach(() => {
  vi.resetAllMocks();
  db.application.findUnique.mockImplementation(async ({ where, select }) => select.appSecret
    ? { id: 'consumer', name: 'Consumer', description: null, appSecret: 'secret' }
    : { usePermissionFrom: where.id === 'consumer' ? 'source' : null });
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.authzPermission.findMany.mockResolvedValue([{ id: 'source.read', name: 'read' }]);
});

describe('permission sharing bridge sync', () => {
  it('exports the source catalog using consumer credentials and identity', async () => {
    const result = await getSyncedAppPermissions(credentials);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ appinfo: { id: 'consumer' }, permissions: [{ id: 'source.read' }] });
    expect(db.authzPermission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { appId: 'source' } }));
  });
  it('denies writing definitions through consumer credentials', async () => {
    const result = await postSyncedAppPermissions(credentials, [{ id: 'consumer.write', title: 'write' }]);
    expect(result.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('keeps imported roles in the consumer while mapping source permission IDs', async () => {
    const result = await postSyncedAppRoles(credentials, [{ id: 'consumer.reader', title: 'reader', permissions: ['read'] }]);
    expect(result.status).toBe(200);
    expect(db.authzPermission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { appId: 'source', name: { in: ['read'] } } }));
    expect(db.authzRole.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ appId: 'consumer' }) }));
    expect(db.authzRolePermissionMap.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ permissionId: 'source.read', roleId: 'consumer.reader' })] }));
  });
  it('updates permission snapshots in consuming roles when a source renames a permission', async () => {
    db.application.findUnique.mockImplementation(async ({ select }) => select.appSecret
      ? { id: 'source', name: 'Source', description: null, appSecret: 'secret' }
      : { usePermissionFrom: null });
    db.authzRolePermissionMap.findMany
      .mockResolvedValueOnce([{ roleId: 'consumer.reader' }])
      .mockResolvedValueOnce([{ permission: { name: 'renamed.read' } }]);
    const result = await postSyncedAppPermissions({ neupAppId: 'source', neupAppSecret: 'secret' }, [{ id: 'source.read', title: 'renamed.read' }]);
    expect(result.status).toBe(200);
    expect(db.authzRole.update).toHaveBeenCalledWith({ where: { id: 'consumer.reader' }, data: { permissions: ['renamed.read'], pushed: false } });
    expect(db.role.updateMany).toHaveBeenCalledWith({ where: { roleId: 'consumer.reader' }, data: { permissions: ['renamed.read'] } });
  });
  it('rejects invalid consumer credentials before reading source permissions', async () => {
    const result = await getSyncedAppPermissions({ ...credentials, neupAppSecret: 'wrong' });
    expect(result.status).toBe(401);
    expect(db.authzPermission.findMany).not.toHaveBeenCalled();
  });
});
