import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
vi.mock('@neup/core/database/prisma', () => ({ default: {
  application: { findUnique: vi.fn() },
  applicationBridge: { findMany: vi.fn() },
  authnRequest: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
} }));
vi.mock('@/services/account/verify', () => ({ getActiveSession: vi.fn() }));
import prisma from '@neup/core/database/prisma';
import { getActiveSession } from '@/services/account/verify';
import { beginProofGrant, consumeProofGrant, parseGrantContext } from '@/services/auth/proof-grant';

const proof = 'a'.repeat(64);
const context = { app: 'app1', platform: 'android', authorizesTo: 'neupestate://auth/callback', state: 'random-state', challenge: crypto.createHash('sha256').update(proof).digest('base64url') };
const tempcode = crypto.randomBytes(32).toString('base64url');
const request = { id: crypto.createHash('sha256').update(tempcode).digest('hex'), type: 'proof_grant', status: 'pending', data: context, accountId: 'account1', expiresAt: new Date(Date.now() + 300000) };
const input = { ...context, proof, tempcode };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.application.findUnique).mockResolvedValue({ appSecret: 'secret' } as any);
  vi.mocked(prisma.applicationBridge.findMany).mockResolvedValue([{ type: 'authorizesTo', details: { platform: 'android' } }] as any);
  vi.mocked(getActiveSession).mockResolvedValue({ accountId: 'account1' } as any);
  vi.mocked(prisma.authnRequest.findUnique).mockResolvedValue(request as any);
  vi.mocked(prisma.authnRequest.updateMany).mockResolvedValue({ count: 1 });
});
const begin = (params = new URLSearchParams(context)) => beginProofGrant('https://neupgroup.com/account/auth/grant', params);

describe('authorization', () => {
  it('returns the exact callback context and a code, storing only its hash and challenge', async () => {
    const url = new URL((await begin()).redirectTo);
    expect(url.protocol).toBe('neupestate:');
    expect(Object.fromEntries(url.searchParams)).toEqual({ app: context.app, platform: context.platform, authorizesTo: context.authorizesTo, state: context.state, tempcode: expect.any(String) });
    const data = vi.mocked(prisma.authnRequest.create).mock.calls[0][0].data;
    expect(data.id).toBe(crypto.createHash('sha256').update(url.searchParams.get('tempcode')!).digest('hex'));
    expect(data.data).toEqual(context);
  });
  it('preserves all context through sign-in and rejects guest sessions', async () => {
    vi.mocked(getActiveSession).mockResolvedValue(null);
    const url = new URL((await begin()).redirectTo);
    expect(url.pathname).toBe('/account/auth/signin');
    const returnTo = new URL(url.searchParams.get('backsTo')!, url);
    expect(returnTo.pathname).toBe('/auth/grant');
    expect(Object.fromEntries(returnTo.searchParams)).toEqual(context);
    expect(getActiveSession).toHaveBeenCalledWith({ expectedGuest: false });
    expect(prisma.authnRequest.create).not.toHaveBeenCalled();
  });
  it('keeps invalid apps and unregistered callbacks on NeupID', async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue(null);
    expect((await begin()).redirectTo).toBe('https://neupgroup.com/account/auth/start?error=invalid_app');
    vi.mocked(prisma.application.findUnique).mockResolvedValue({ appSecret: 'secret' } as any);
    vi.mocked(prisma.applicationBridge.findMany).mockResolvedValue([]);
    expect((await begin()).redirectTo).toContain('/account/auth/start?error=invalid_redirect');
    expect(prisma.authnRequest.create).not.toHaveBeenCalled();
  });
  it('rejects a callback registered for a different platform', async () => {
    vi.mocked(prisma.applicationBridge.findMany).mockResolvedValue([{ type: 'authorizesTo', details: { platform: 'ios' } }] as any);
    expect((await begin()).redirectTo).toContain('error=invalid_redirect');
  });
  it('accepts an existing registered callback', async () => {
    vi.mocked(prisma.applicationBridge.findMany).mockResolvedValue([{ type: 'authenticatesTo', details: null }] as any);
    expect((await begin()).redirectTo).toContain('tempcode=');
  });
  it('rejects duplicate parameters and secrets in the authorization URL', async () => {
    const params = new URLSearchParams(context);
    params.append('state', 'other');
    expect((await begin(params)).redirectTo).toContain('error=invalid_request');
    params.delete('state'); params.set('state', context.state); params.set('proof', proof);
    expect((await begin(params)).redirectTo).toContain('error=invalid_request');
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'file://host/path', 'http://example.com', 'com.example.app', 'https://example.com/#fragment', 'https://example.com/?tempcode=injected'])('rejects unsafe callback %s', authorizesTo => {
    expect(parseGrantContext({ ...context, authorizesTo })).toBeNull();
  });
  it('requires HTTPS for web and a supported platform', () => {
    expect(parseGrantContext({ ...context, platform: 'web' })).toBeNull();
    expect(parseGrantContext({ ...context, platform: 'linux' })).toBeNull();
  });
});

describe('proof exchange', () => {
  it('consumes a valid code with an atomic pending and expiry condition', async () => {
    expect(await consumeProofGrant(input)).toEqual(request);
    expect(prisma.authnRequest.updateMany).toHaveBeenCalledWith({ where: { id: request.id, type: 'proof_grant', status: 'pending', expiresAt: { gt: expect.any(Date) } }, data: { status: 'used' } });
  });
  it.each(['app', 'platform', 'authorizesTo', 'state', 'challenge', 'proof'] as const)('rejects a changed %s without consuming the code', async key => {
    expect(await consumeProofGrant({ ...input, [key]: key === 'proof' ? 'b'.repeat(64) : 'changed' })).toBeNull();
    expect(prisma.authnRequest.updateMany).not.toHaveBeenCalled();
  });
  it('cannot replace the stored challenge with one matching an attacker proof', async () => {
    const attackerProof = 'b'.repeat(64);
    expect(await consumeProofGrant({ ...input, proof: attackerProof, challenge: crypto.createHash('sha256').update(attackerProof).digest('base64url') })).toBeNull();
    expect(prisma.authnRequest.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ status: 'used' }, { type: 'bridge_grant' }, { expiresAt: new Date(0) }, { accountId: null }])('rejects invalid stored request %j', async patch => {
    vi.mocked(prisma.authnRequest.findUnique).mockResolvedValue({ ...request, ...patch } as any);
    expect(await consumeProofGrant(input)).toBeNull();
    expect(prisma.authnRequest.updateMany).not.toHaveBeenCalled();
  });
  it('rejects revoked callbacks', async () => {
    vi.mocked(prisma.applicationBridge.findMany).mockResolvedValue([]);
    expect(await consumeProofGrant(input)).toBeNull();
  });
  it('allows only one concurrent exchange', async () => {
    vi.mocked(prisma.authnRequest.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([consumeProofGrant(input), consumeProofGrant(input)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
