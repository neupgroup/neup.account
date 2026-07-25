import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { extractGenderFromDetails, resolveDisplayImage } from '@/inapp/display-image';

/*
::neup.documentation::whoami-service
::title WhoAmI Resolution Service

Resolves a session triplet into the current account identity payload.

::public

This file is shared by the REST identity endpoint and the gRPC verification surface.

::public end

::private

The service validates the session first, then shapes the account identity payload with block-state checks and display-image resolution.

::private end

::end
*/

export type WhoAmIResult =
  | {
      status: 200;
      body: {
        success: true;
        accountId: string;
        neupId: string | null;
        displayName: string | null;
        displayImage: string | null;
        accountType: string | null;
        verified: boolean;
      };
    }
  | {
      status: 401 | 403 | 500;
      body: { error: string; error_description?: string };
    };

/**
 * ::neup.documentation::resolve-whoami
 * ::function resolveWhoAmI(input)
 *
 * Resolves the current account identity from a session triplet.
 *
 * ::public
 *
 * The response includes `accountId`, `neupId`, `displayName`, `displayImage`, `accountType`, and `verified`.
 *
 * ::public end
 *
 * ::private
 *
 * The service validates session existence and expiry, blocks blocked accounts, and computes display fields from both account and profile records.
 *
 * ::private end
 *
 * ::end
 */
/**
 * Resolves a session triplet (accountId + sessionId + sessionKey) to a user identity.
 * Used by both the REST whoami endpoint and the gRPC Verify RPC.
 */
export async function resolveWhoAmI(input: {
  accountId: string;
  sessionId: string;
  sessionKey: string;
}): Promise<WhoAmIResult> {
  const { accountId, sessionId, sessionKey } = input;

  if (!accountId || !sessionId || !sessionKey) {
    return {
      status: 401,
      body: { error: 'unauthorized', error_description: 'Missing session credentials' },
    };
  }

  try {
    const session = await prisma.authnSession.findUnique({
      where: { id: sessionId },
      select: { accountId: true, key: true, validTill: true },
    });

    if (
      !session ||
      session.accountId !== accountId ||
      session.key !== sessionKey ||
      !session.validTill ||
      session.validTill <= new Date()
    ) {
      return {
        status: 401,
        body: { error: 'unauthorized', error_description: 'Invalid or expired session' },
      };
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        status: true,
        displayName: true,
        displayImage: true,
        isVerified: true,
        accountType: true,
        details: true,
        neupIds: { where: { isPrimary: true }, take: 1, select: { id: true } },
        individualProfile: { select: { firstName: true, lastName: true, details: true } },
        brandProfile: { select: { brandName: true } },
      },
    });

    if (!account) {
      return {
        status: 401,
        body: { error: 'unauthorized', error_description: 'Account not found' },
      };
    }

    // Check for active block
    const details = account.details as Record<string, any> | null;
    const block = details?.block as { is_permanent?: boolean; until?: string | Date } | null;
    if (account.status === 'blocked' && block) {
      const isPermanent = block.is_permanent;
      const isTemporary = block.until && new Date(block.until) > new Date();
      if (isPermanent || isTemporary) {
        return {
          status: 403,
          body: { error: 'account_blocked', error_description: 'This account is currently blocked' },
        };
      }
    }

    const neupId = account.neupIds[0]?.id ?? null;
    const displayName =
      account.brandProfile?.brandName ||
      account.displayName ||
      [account.individualProfile?.firstName, account.individualProfile?.lastName]
        .filter(Boolean)
        .join(' ') ||
      null;
    const gender = extractGenderFromDetails({
      accountDetails: account.details,
      individualDetails: account.individualProfile?.details,
    });

    return {
      status: 200,
      body: {
        success: true,
        accountId: account.id,
        neupId,
        displayName,
        displayImage: resolveDisplayImage({
          displayImage: account.displayImage,
          accountType: account.accountType,
          gender,
        }),
        accountType: account.accountType || null,
        verified: account.isVerified ?? false,
      },
    };
  } catch (error) {
    await logError('auth', error, 'resolve_whoami');
    return {
      status: 500,
      body: { error: 'internal_server_error', error_description: 'An unexpected error occurred' },
    };
  }
}
