'use server';

import prisma from '@/core/helpers/prisma';
import { hasAnyPermission, PROFILE_SECTION_PERMISSIONS } from '@/core/auth/profile-permissions';
import { validateAuthSession } from '@/services/auth/session';
import { getAccountPermission, getGrantedAccountPermission, getUserProfile } from '@/services/user';

type BridgeGetProfileInput = {
  tempToken?: string | null;
  appId?: string | null;
  requestedAid?: string | null;
  requestedNeupId?: string | null;
  headerAid?: string | null;
  headerSid?: string | null;
  headerSkey?: string | null;
};

type BridgeGetProfileResult = {
  status: number;
  body: Record<string, unknown>;
};

async function resolveAuthenticatedAccountId(input: BridgeGetProfileInput): Promise<string | null> {
  const tempToken = input.tempToken?.trim();
  const appId = input.appId?.trim();

  if (tempToken && appId) {
    const request = await prisma.authnRequest.findUnique({
      where: { id: tempToken },
      select: { type: true, status: true, expiresAt: true, accountId: true, data: true },
    });
    const requestData =
      request?.data && typeof request.data === 'object'
        ? (request.data as Record<string, unknown>)
        : null;

    if (
      request &&
      request.type === 'bridge_grant' &&
      request.status === 'pending' &&
      request.expiresAt > new Date() &&
      request.accountId &&
      requestData?.appId === appId
    ) {
      return request.accountId;
    }
  }

  const aid = input.headerAid?.trim();
  const sid = input.headerSid?.trim();
  const skey = input.headerSkey?.trim();

  if (!aid || !sid || !skey) {
    return null;
  }

  const validation = await validateAuthSession({ aid, sid, skey });
  return validation.status === 'valid' ? aid : null;
}

async function resolveTargetAccountId(input: BridgeGetProfileInput, authenticatedAccountId: string) {
  const requestedAid = input.requestedAid?.trim();
  if (requestedAid) return requestedAid;

  const requestedNeupId = input.requestedNeupId?.trim().toLowerCase();
  if (!requestedNeupId) return authenticatedAccountId;

  const neupId = await prisma.neupId.findUnique({
    where: { id: requestedNeupId },
    select: { accountId: true },
  });

  return neupId?.accountId ?? null;
}

export async function bridgeGetProfile(input: BridgeGetProfileInput): Promise<BridgeGetProfileResult> {
  const authenticatedAccountId = await resolveAuthenticatedAccountId(input);
  if (!authenticatedAccountId) {
    return { status: 401, body: { success: false, error: 'invalid_session' } };
  }

  const targetAccountId = await resolveTargetAccountId(input, authenticatedAccountId);
  if (!targetAccountId) {
    return { status: 404, body: { success: false, error: 'user_not_found' } };
  }

  const [rootPermissions, scopedPermissions] = await Promise.all([
    getAccountPermission(authenticatedAccountId),
    targetAccountId === authenticatedAccountId
      ? getAccountPermission(authenticatedAccountId)
      : getGrantedAccountPermission(authenticatedAccountId, targetAccountId),
  ]);

  const permissions = Array.from(new Set([...rootPermissions, ...scopedPermissions]));
  if (!hasAnyPermission(permissions, PROFILE_SECTION_PERMISSIONS.display)) {
    return { status: 403, body: { success: false, error: 'forbidden' } };
  }

  const profile = await getUserProfile(targetAccountId);
  if (!profile) {
    return { status: 404, body: { success: false, error: 'user_not_found' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      profile: {
        accountId: targetAccountId,
        displayName: profile.nameDisplay || `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim(),
        displayPhoto: profile.accountPhoto || null,
        neupId: profile.neupIdPrimary || null,
        verified: profile.verified ?? false,
        accountType: profile.accountType || null,
      },
    },
  };
}
