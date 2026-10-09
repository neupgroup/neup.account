import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@neup/core/database/prisma', () => ({ default: {
  authnRequest: { update: vi.fn() }, account: { findUnique: vi.fn() },
  application: { findUnique: vi.fn() }, connection: { upsert: vi.fn() }, authnSession: { create: vi.fn() },
} }));
vi.mock('@/services/auth/proof-grant', () => ({ consumeProofGrant: vi.fn() }));
vi.mock('@neup/logica/logger/files', () => ({ logError: vi.fn() }));
vi.mock('@/services/notifications', () => ({ makeNotification: vi.fn() }));
vi.mock('@/services/user', () => ({ getAccountPermission: vi.fn(async () => []), isRootUser: vi.fn(async () => false) }));
vi.mock('@/services/applications/default-role', () => ({ getApplicationDefaultRoleId: vi.fn(async () => 'role1') }));
import prisma from '@neup/core/database/prisma';
import { consumeProofGrant } from '@/services/auth/proof-grant';
import { bridgeIssueGrant } from '@/services/auth/grant';
import jwt from 'jsonwebtoken';
const request = { id: 'code', type: 'proof_grant', data: { app: 'app1' }, accountId: 'account1', expiresAt: new Date(Date.now() + 300000) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeProofGrant).mockResolvedValue(request as any);
  vi.mocked(prisma.application.findUnique).mockResolvedValue({ appSecret: 'secret', name: 'Example' } as any);
  vi.mocked(prisma.account.findUnique).mockResolvedValue({ accountType: 'individual' } as any);
  vi.mocked(prisma.authnSession.create).mockResolvedValue({ id: 'session1' } as any);
});
it('issues real app-scoped credentials only after proof validation', async () => {
  const result = await bridgeIssueGrant({ app: 'app1', tempcode: 'code', proof: 'proof' });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ success: true, aid: 'account1', sid: 'session1', skey: expect.any(String), token: expect.any(String) });
  expect(jwt.verify(result.body.token, 'secret')).toMatchObject({ aid: 'account1', sid: 'session1', appId: 'app1' });
  expect(prisma.authnRequest.update).not.toHaveBeenCalled();
});
it('does not create sessions when proof validation fails', async () => {
  vi.mocked(consumeProofGrant).mockResolvedValue(null);
  expect((await bridgeIssueGrant({ app: 'app1', tempcode: 'code' })).status).toBe(401);
  expect(prisma.authnSession.create).not.toHaveBeenCalled();
});
it('rejects mixed legacy and proof fields without consuming either code', async () => {
  expect((await bridgeIssueGrant({ app: 'app1', tempcode: 'code', tempToken: 'legacy' })).status).toBe(400);
  expect(consumeProofGrant).not.toHaveBeenCalled();
  expect(prisma.authnRequest.update).not.toHaveBeenCalled();
});
it.each([null, [], { app: 42, tempcode: 'code' }])('rejects malformed bodies %j', async input => {
  expect((await bridgeIssueGrant(input as any)).status).toBe(400);
});
it('retains legacy exchange with its separate request type', async () => {
  vi.mocked(prisma.authnRequest.update).mockResolvedValue({ ...request, type: 'bridge_grant', data: { appId: 'app1' } } as any);
  expect((await bridgeIssueGrant({ app: 'app1', tempToken: 'legacy' })).status).toBe(200);
  expect(consumeProofGrant).not.toHaveBeenCalled();
  expect(prisma.authnRequest.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'legacy', type: 'bridge_grant', status: 'pending' } }));
});
