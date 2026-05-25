'use server';

import jwt from 'jsonwebtoken';
import prisma from '@/core/helpers/prisma';

export type ResolveAppTokenResult =
  | { ok: true; accountId: string; appId: string; connectionId: string }
  | { ok: false; status: 400 | 401; error: string };

export async function resolveAppTokenAuth(input: {
  token: string | null;
  appSecret: string | null;
}): Promise<ResolveAppTokenResult> {
  const token = (input.token ?? '').trim();
  const appSecret = (input.appSecret ?? '').trim();

  if (!token || !appSecret) {
    return { ok: false, status: 400, error: 'token and appSecret are required.' };
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, appSecret, { algorithms: ['HS256'] });
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }

  const cid = typeof decoded?.cid === 'string' ? decoded.cid : null;
  if (!cid) {
    return { ok: false, status: 401, error: 'Invalid token payload.' };
  }

  const connection = await prisma.connection.findUnique({
    where: { id: cid },
    select: { id: true, accountId: true, appId: true },
  });

  if (!connection) {
    return { ok: false, status: 401, error: 'Invalid token connection.' };
  }

  const app = await prisma.application.findUnique({
    where: { id: connection.appId },
    select: { appSecret: true },
  });

  if (!app?.appSecret || app.appSecret !== appSecret) {
    return { ok: false, status: 401, error: 'Invalid application credentials.' };
  }

  return { ok: true, accountId: connection.accountId, appId: connection.appId, connectionId: connection.id };
}

