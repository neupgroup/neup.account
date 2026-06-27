'use server';

import jwt from 'jsonwebtoken';
import prisma from '@/core/helpers/prisma';

/*
::neup.documentation::app-token-auth-service
::title App Token Auth Service

Resolves app bearer-token authentication into the owning connection and account.

::public

This file is used by bridge routes that accept app bearer tokens instead of cookie-backed sessions.

::public end

::private

The token is verified against the supplied app secret, then cross-checked against the stored connection row and application secret.

::private end

::end
*/

export type ResolveAppTokenResult =
  | { ok: true; accountId: string; appId: string; connectionId: string }
  | { ok: false; status: 400 | 401; error: string };

/*
::neup.documentation::resolve-app-token-auth
::function resolveAppTokenAuth(input)

Resolves app bearer-token credentials into the authenticated connection context.

::public

On success the result includes `accountId`, `appId`, and `connectionId`.

::public end

::private

The function verifies the JWT, extracts `cid`, loads the connection row, and confirms that the provided app secret matches the owning application.

::private end

::end
*/
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
