import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/services/auth/proof-grant', () => ({ beginProofGrant: vi.fn() }));
vi.mock('@/services/auth/grant', () => ({ bridgeIssueGrant: vi.fn() }));
import { GET, POST } from '@/app/auth/grant/route';
import { beginProofGrant } from '@/services/auth/proof-grant';
import { bridgeIssueGrant } from '@/services/auth/grant';
beforeEach(() => vi.resetAllMocks());
const url = 'https://neupgroup.com/account/auth/grant';
it('returns native callback Location without caching or referrer disclosure', async () => {
  vi.mocked(beginProofGrant).mockResolvedValue({ redirectTo: 'neupestate://auth/callback?tempcode=code' });
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('neupestate://auth/callback?tempcode=code');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
});
it('returns a local failure on database errors', async () => {
  vi.mocked(beginProofGrant).mockRejectedValue(new Error('database error'));
  expect((await GET(new NextRequest(url))).status).toBe(500);
});
it.each(['{', 'null', '[]', '{"tempToken":"legacy"}'])('rejects invalid exchange body %s', async body => {
  const response = await POST(new NextRequest(url, { method: 'POST', body }));
  expect(response.status).toBe(400);
  expect(bridgeIssueGrant).not.toHaveBeenCalled();
});
it('passes the full proof exchange to the service and disables caching', async () => {
  const body = { app: 'app', platform: 'android', authorizesTo: 'neupestate://auth/callback', state: 'state', challenge: 'challenge', proof: 'proof', tempcode: 'code' };
  vi.mocked(bridgeIssueGrant).mockResolvedValue({ status: 200, body: { success: true, token: 'token' } });
  const response = await POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }));
  expect(bridgeIssueGrant).toHaveBeenCalledWith(body);
  expect(await response.json()).toEqual({ success: true, token: 'token' });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
