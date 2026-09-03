import prisma from '@/.neup/core/database/prisma';
import { createSigninAuthnRequest } from './AuthenticationFlow';
import { getAuthRequest } from './auth-request';
import { validateNeupId } from '@/services/user';
import jwt from 'jsonwebtoken';

const AUTH_REQUEST_TTL_SECONDS = 20 * 60;

function getSecret() {
  const secret = process.env.AUTH_REQUEST_JWT_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('AUTH_REQUEST_JWT_SECRET is not configured.');
  return secret;
}

export async function issueBridgeSigninRequest() {
  const id = await createSigninAuthnRequest();
  const now = Math.floor(Date.now() / 1000);
  const expiresOn = now + AUTH_REQUEST_TTL_SECONDS;

  return {
    id,
    actBefore: new Date(expiresOn * 1000).toISOString(),
    expiresOn: new Date(expiresOn * 1000).toISOString(),
    jwt: jwt.sign({ id, actBefore: expiresOn, expiresOn }, getSecret(), {
      algorithm: 'HS256',
    }),
  };
}

export async function resolveBridgeSignin(neupIdInput: string, token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    return { status: 401, body: { success: false, error: 'Invalid or expired auth request.' } };
  }

  if (typeof payload.id !== 'string' || typeof payload.expiresOn !== 'number' || payload.expiresOn <= Math.floor(Date.now() / 1000)) {
    return { status: 401, body: { success: false, error: 'Invalid or expired auth request.' } };
  }

  const request = await getAuthRequest(payload.id, { expectedType: 'signin' });
  if (!request) return { status: 401, body: { success: false, error: 'Invalid or expired auth request.' } };

  const neupId = neupIdInput.trim().toLowerCase();
  if (!neupId) return { status: 400, body: { success: false, error: 'NeupID is required.' } };
  const validation = await validateNeupId(neupId);
  if (!validation.success && validation.error !== 'pending_deletion') {
    return { status: 404, body: { success: false, error: 'NeupID not found.' } };
  }

  const record = await prisma.neupId.findUnique({
    where: { id: neupId },
    select: { neupId: true, accountId: true, account: { select: { displayImage: true, displayName: true, brandProfile: { select: { brandName: true } }, individualProfile: { select: { firstName: true, lastName: true } } } } },
  });
  if (!record?.accountId || !record.account) return { status: 404, body: { success: false, error: 'NeupID not found.' } };

  const displayName = record.account.displayName || record.account.brandProfile?.brandName || [record.account.individualProfile?.firstName, record.account.individualProfile?.lastName].filter(Boolean).join(' ') || null;
  return { status: 200, body: { neupid: record.neupId, displayImage: record.account.displayImage, displayName, continue: 'password' } };
}
