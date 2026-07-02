'use server';

import prisma from '@/core/helpers/prisma';
import { hasAnyPermission, PROFILE_SECTION_PERMISSIONS } from '@/core/auth/profile-permissions';
import { validateAuthSession } from '@/services/auth/session';
import { getAccountPermission, getGrantedAccountPermission, getUserProfile } from '@/services/user';
import { permission } from '@/logica/permission';

const servicePermissions = [
  permission('profile.display.view.self', 'for_individual', 'service'),
  permission('profile.display.update.self', 'for_individual', 'service'),
  permission('profile.display.view.managed', 'for_individual', 'service'),
  permission('profile.display.update.managed', 'for_individual', 'service'),
  permission('profile.display.view.root', 'for_individual', 'service'),
  permission('profile.display.update.root', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::profile-bridge-module
 * ::title Profile Bridge Service
 *
 * Resolves bridge-safe display profile payloads from either auth-session headers or temporary grant tokens.
 *
 * ::public
 *
 * This service supports both standard signed requests and temporary bridge grant flows when resolving a target profile.
 *
 * ::public end
 *
 * ::private
 *
 * The service enforces display-profile authorization only and intentionally returns structured HTTP status/body tuples for route handlers to forward unchanged.
 *
 * ::private end
 *
 * ::end
 */
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
  /**
   * ::neup.documentation::profile-bridge-resolve-authenticated-account-id
   * ::function resolveAuthenticatedAccountId(input)
   *
   * Resolves the authenticated bridge account from either a temp token flow or auth-session headers.
   *
   * ::public
   *
   * Temporary grant tokens are accepted only when paired with the expected `appId`.
   *
   * ::public end
   *
   * ::private
   *
   * Header-based auth requires a valid `aid`/`sid`/`skey` session triplet validated through the auth-session service.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::profile-bridge-resolve-target-account-id
   * ::function resolveTargetAccountId(input, authenticatedAccountId)
   *
   * Resolves which profile account should be returned for the bridge request.
   *
   * ::public
   *
   * The request may target an explicit account ID, a NeupID, or default to the authenticated account.
   *
   * ::public end
   *
   * ::private
   *
   * NeupID lookups are normalized to lowercase before hitting storage.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::profile-bridge-get-profile
   * ::function bridgeGetProfile(input)
   *
   * Returns a bridge-safe display profile payload for the authenticated or requested account.
   *
   * ::public
   *
   * The success payload includes account ID, display name, display photo, primary NeupID, verification flag, and account type.
   *
   * ::public end
   *
   * ::private
   *
   * Authorization merges direct and granted permissions, then requires display-profile access before reading the target profile.
   *
   * ::private end
   *
   * ::param external input
   * ::datatype object
   * ::required true
   *
   * Bridge request inputs including temp-token fields, optional requested account fields, and session headers.
   *
   * ::returns BridgeGetProfileResult
   *
   * Structured HTTP status/body tuple for the route layer.
   *
   * ::end
   */
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
