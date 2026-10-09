import crypto from 'crypto';
import prisma from '@neup/core/database/prisma';
import { getActiveSession } from '@/services/account/verify';

export const grantPlatforms = ['web', 'android', 'ios', 'macos', 'windows'] as const;
export type GrantContext = {
  app: string;
  platform: string;
  authorizesTo: string;
  state: string;
  challenge: string;
};
export type ProofGrantInput = Partial<GrantContext> & { tempcode?: string; proof?: string };
const contextKeys = ['app', 'platform', 'authorizesTo', 'state', 'challenge'] as const;

export function parseGrantContext(input: unknown): GrantContext | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (contextKeys.some(key => typeof value[key] !== 'string' || !value[key] || (value[key] as string).length > 2048)) return null;
  const context = value as GrantContext;
  if (context.app !== context.app.trim().toLowerCase()) return null;
  if (!(grantPlatforms as readonly string[]).includes(context.platform)) return null;
  // SHA-256 encoded as unpadded base64url (32 bytes, 43 characters).
  if (!/^[A-Za-z0-9_-]{43}@base/.test(context.challenge) || Buffer.from(context.challenge, 'base64url').toString('base64url') !== context.challenge) return null;
  try {
    const callback = new URL(context.authorizesTo);
    if (callback.username || callback.password || callback.hash) return null;
    if (context.platform === 'web') {
      if (callback.protocol !== 'https:') return null;
    } else if (callback.protocol !== 'https:' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(context.authorizesTo)) {
      return null;
    }
    if (['http:', 'javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:', 'ftp:'].includes(callback.protocol)) return null;
    if (['app', 'platform', 'authorizesTo', 'state', 'tempcode', 'proof', 'challenge'].some(key => callback.searchParams.has(key))) return null;
  } catch { return null; }
  return Object.fromEntries(contextKeys.map(key => [key, context[key]])) as GrantContext;
}

async function registeredCallback(context: GrantContext) {
  // Existing callback registrations remain usable; new registrations can bind a platform in details.
  const records = await prisma.applicationBridge.findMany({
    where: { appId: context.app, type: { in: ['authorizesTo', 'authenticatesTo'] }, value: context.authorizesTo },
    select: { type: true, details: true },
  });
  return records.some(record => {
    const details = record.details as { platform?: unknown } | null;
    return details?.platform === context.platform || (record.type === 'authenticatesTo' && !details?.platform);
  });
}

export async function beginProofGrant(requestUrl: string, params: URLSearchParams): Promise<{ redirectTo: string }> {
  const fail = (error: string) => ({ redirectTo: new URL(`/account/auth/start?error=${error}`, requestUrl).toString() });
  if (contextKeys.some(key => params.getAll(key).length !== 1) || ['appId', 'authenticatesTo', 'proof', 'tempcode'].some(key => params.has(key))) return fail('invalid_request');
  const context = parseGrantContext(Object.fromEntries(params));
  if (!context) return fail('invalid_request');
  const application = await prisma.application.findUnique({ where: { id: context.app }, select: { appSecret: true } });
  if (!application?.appSecret) return fail('invalid_app');
  if (!await registeredCallback(context)) return fail('invalid_redirect');

  const session = await getActiveSession({ expectedGuest: false });
  if (!session) {
    const returnTo = `/auth/grant?${new URLSearchParams(context)}`;
    const signin = new URL('/account/auth/signin', requestUrl);
    signin.searchParams.set('backsTo', returnTo);
    return { redirectTo: signin.toString() };
  }

  const tempcode = crypto.randomBytes(32).toString('base64url');
  await prisma.authnRequest.create({
    data: {
      id: crypto.createHash('sha256').update(tempcode).digest('hex'),
      type: 'proof_grant', status: 'pending', data: context,
      accountId: session.accountId, expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  const callback = new URL(context.authorizesTo);
  for (const key of ['app', 'platform', 'authorizesTo', 'state'] as const) callback.searchParams.set(key, context[key]);
  callback.searchParams.set('tempcode', tempcode);
  return { redirectTo: callback.toString() };
}

export async function consumeProofGrant(input: ProofGrantInput) {
  const context = parseGrantContext(input);
  if (!context || typeof input.tempcode !== 'string' || !/^[A-Za-z0-9_-]{43}@base/.test(input.tempcode)
    || typeof input.proof !== 'string' || !/^[A-Za-z0-9._~-]{43,128}@base/.test(input.proof)) return null;
  const id = crypto.createHash('sha256').update(input.tempcode).digest('hex');
  const request = await prisma.authnRequest.findUnique({ where: { id } });
  if (!request || request.type !== 'proof_grant' || request.status !== 'pending' || !request.accountId || request.expiresAt <= new Date()) return null;
  const stored = parseGrantContext(request.data);
  if (!stored || contextKeys.some(key => stored[key] !== context[key])) return null;
  const actual = crypto.createHash('sha256').update(input.proof, 'ascii').digest();
  if (!crypto.timingSafeEqual(actual, Buffer.from(stored.challenge, 'base64url'))) return null;
  if (!await registeredCallback(stored)) return null;
  // Only a correct proof can consume the code. Concurrent exchanges have one winner.
  const consumed = await prisma.authnRequest.updateMany({
    where: { id, type: 'proof_grant', status: 'pending', expiresAt: { gt: new Date() } },
    data: { status: 'used' },
  });
  return consumed.count === 1 ? request : null;
}
