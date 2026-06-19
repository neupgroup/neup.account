'use server';

import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { verifyAccountToken } from '@/core/auth/accountToken';
import { validateAuthSession } from '@/services/auth/session';
import { logError } from '@/core/helpers/logger';
import { assignOwnApplicationRole } from '@/services/applications/access';

function getHeaderToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
    return token.trim();
  }

  const tokenKey = request.headers.get('x-token-key')?.trim();
  return tokenKey || null;
}

async function resolveAccountFromToken(token: string, appId: string): Promise<string | null> {
  const accountPayload = await verifyAccountToken(token);
  if (accountPayload) {
    const validation = await validateAuthSession({
      aid: accountPayload.aid,
      sid: accountPayload.sid,
      skey: accountPayload.skey,
    });

    return validation.status === 'valid' ? accountPayload.aid : null;
  }

  const application = await prisma.application.findUnique({
    where: { id: appId },
    select: { appSecret: true },
  });
  if (!application?.appSecret) return null;

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, application.appSecret);
  } catch {
    return null;
  }

  const cid = typeof decoded === 'object' && decoded && 'cid' in decoded
    ? String((decoded as Record<string, unknown>).cid ?? '').trim()
    : '';
  if (!cid) return null;

  const connection = await prisma.connection.findUnique({
    where: { id: cid },
    select: { accountId: true, appId: true, status: true },
  });
  if (!connection || connection.appId !== appId || connection.status !== 'active') {
    return null;
  }

  return connection.accountId;
}

async function resolveTargetAccountId(request: NextRequest, appId: string): Promise<string | null> {
  if (request.headers.get('auth_account') !== null) {
    return null;
  }

  const headerToken = getHeaderToken(request);
  if (headerToken) {
    const accountId = await resolveAccountFromToken(headerToken, appId);
    if (accountId) return accountId;
  }

  const cookieToken = request.cookies.get('auth_account')?.value?.trim();
  if (!cookieToken) return null;

  return resolveAccountFromToken(cookieToken, appId);
}

export async function bridgeAssignRoleToCurrentAccount(request: NextRequest): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const searchParams = request.nextUrl.searchParams;
  const appId = (searchParams.get('application') || '').trim();
  const roleReference = (searchParams.get('role') || '').trim();

  if (!appId || !roleReference) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: '`application` and `role` query parameters are required.',
      },
    };
  }

  try {
    const accountId = await resolveTargetAccountId(request, appId);
    if (!accountId) {
      return {
        status: 401,
        body: {
          success: false,
          error: 'unauthorized',
          error_description: 'A valid bearer token or auth_account cookie is required.',
        },
      };
    }

    const result = await assignOwnApplicationRole({
      accountId,
      appId,
      roleReference,
      requestSource: 'bridge.api.v1.roles.assign.me',
    });

    if (!result.success) {
      const error = result.error.toLowerCase();
      const status =
        error.includes('not found') ? 404 :
        error.includes('cannot be requested') ? 403 :
        400;
      return { status, body: { success: false, error: result.error } };
    }

    if (result.mode === 'assigned') {
      return {
        status: 200,
        body: {
          success: true,
          mode: result.mode,
          accountId,
          application: result.appId,
          roleId: result.roleId,
          roleName: result.roleName,
          roleScope: result.scope,
        },
      };
    }

    return {
      status: 202,
      body: {
        success: true,
        mode: result.mode,
        accountId,
        application: result.appId,
        roleId: result.roleId,
        roleName: result.roleName,
        roleScope: result.scope,
        requestId: result.requestId,
      },
    };
  } catch (error) {
    await logError('auth', error, `bridgeAssignRoleToCurrentAccount:${appId}:${roleReference}`);
    return {
      status: 500,
      body: { success: false, error: 'internal_server_error' },
    };
  }
}
