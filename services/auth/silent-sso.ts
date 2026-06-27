import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Identity } from '@/prisma/generated/client';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { extractGenderFromDetails, resolveDisplayImage } from '@/core/helpers/display-image';

/*
::neup.documentation::silent-sso-service
::title Silent SSO Service

Service helpers for the hidden-iframe silent sign-in flow.

::public

This file owns origin validation, rate limiting, guest-identity resolution, JWT signing for iframe responses, and server-side exchange of silent auth codes.

::public end

::private

Route files under `app/bridge/silent.v1` should document the HTTP contract. This file should document the underlying auth behavior and shared helper semantics.

::private end

::end
*/

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

type RateLimitEntry = { count: number; windowStart: number };
export const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * In-memory rate limiter: 10 requests per origin per minute.
 * Returns true if the request should be allowed, false if rate-limited.
 */
export function checkRateLimit(origin: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(origin);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(origin, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Origin validation
// ---------------------------------------------------------------------------

/**
 * ::neup.documentation::silent-sso-origin-validation
 * ::function validateSilentSsoOrigin(origin)
 *
 * Validates whether an origin is registered for silent SSO.
 *
 * ::public
 *
 * Matching is based on scheme plus host, ignoring path and query string.
 *
 * ::public end
 *
 * ::private
 *
 * The function reads `ApplicationBridge` rows of type `silentSsoOrigin` and returns the matching `appId` when found.
 *
 * ::private end
 *
 * ::param external origin
 * ::datatype string
 * ::required true
 *
 * Candidate origin to validate.
 *
 * ::end
 */
/**
 * Validates an incoming origin against ApplicationBridge records of type 'silentSsoOrigin'.
 * Matches by scheme + host only (ignoring path and query string).
 */
export async function validateSilentSsoOrigin(
  origin: string
): Promise<{ valid: boolean; appId: string | null }> {
  try {
    const records = await prisma.applicationBridge.findMany({
      where: { type: 'silentSsoOrigin' },
    });

    for (const record of records) {
      try {
        const registeredOrigin = new URL(record.value).origin;
        const requestOrigin = new URL(origin).origin;
        if (registeredOrigin === requestOrigin) {
          return { valid: true, appId: record.appId };
        }
      } catch {
        // Skip malformed URL entries
      }
    }

    return { valid: false, appId: null };
  } catch (error) {
    await logError('auth', error, 'validate_silent_sso_origin');
    return { valid: false, appId: null };
  }
}

// ---------------------------------------------------------------------------
// Identity resolution (guest account based)
// ---------------------------------------------------------------------------

/**
 * Looks up an existing Identity for (guestAccountId, appId) or creates one.
 * The guest account ID (from the guest_acc cookie) replaces the old trackId.
 * Sets validTill = now + 4 weeks, refreshesOn = now + 1 hour.
 */
export async function resolveOrCreateIdentity(
  guestAccountId: string,
  appId: string
): Promise<Identity> {
  const now = new Date();
  const refreshesOn = new Date(now.getTime() + 3_600_000);
  const validTill = new Date(now.getTime() + 4 * 7 * 24 * 3_600_000);

  // Identity.trackId now stores the guest account ID as the stable device identifier
  return prisma.identity.upsert({
    where: { trackId_appId: { trackId: guestAccountId, appId } },
    create: {
      trackId: guestAccountId,
      appId,
      originatedOn: now,
      refreshesOn,
      validTill,
      details: [],
    },
    update: {},
  });
}

// ---------------------------------------------------------------------------
// JWT signing
// ---------------------------------------------------------------------------

export type IdentityDetail = { key: string; value: string };

/**
 * ::neup.documentation::silent-sso-jwt-signing
 * ::function signIdentityJwt(identity, appId, details)
 *
 * Signs the app-scoped JWT returned by the silent SSO flow.
 *
 * ::public
 *
 * The signed payload contains `ssid`, `expires_on`, `refreshes_on`, and `details`.
 *
 * ::public end
 *
 * ::private
 *
 * Signing uses `Application.appSecret` with HS256. The `details` array is computed at request time and is not persisted back to the `Identity` row.
 *
 * ::private end
 *
 * ::param external identity
 * ::datatype Identity
 * ::required true
 *
 * Resolved identity row for the guest/application pair.
 *
 * ::param external appId
 * ::datatype string
 * ::required true
 *
 * Application identifier used to resolve the signing secret.
 *
 * ::end
 */
/**
 * Signs a JWT with the application's appSecret (HS256).
 *
 * Payload: { ssid, expires_on, refreshes_on, details }
 *
 * `details` is an array of { key, value } pairs computed fresh at request
 * time from the user's account data. It is included in the JWT so apps
 * receive it via postMessage, but it is never stored in the Identity table
 * or in any cookie.
 *
 * When the user is unauthenticated, details is an empty array.
 */
export async function signIdentityJwt(
  identity: Identity,
  appId: string,
  details: IdentityDetail[] = []
): Promise<string> {
  const application = await prisma.application.findUnique({
    where: { id: appId },
    select: { appSecret: true },
  });

  if (!application || !application.appSecret) {
    throw new Error(`Application ${appId} not found or has no appSecret`);
  }

  const payload = {
    ssid: identity.id,
    expires_on: identity.validTill.toISOString(),
    refreshes_on: identity.refreshesOn.toISOString(),
    details,
  };

  return jwt.sign(payload, application.appSecret, { algorithm: 'HS256' });
}

// ---------------------------------------------------------------------------
// Account details builder
// ---------------------------------------------------------------------------

/**
 * Builds the details array from a user's account data.
 * Only called when the user is authenticated.
 *
 * Produces entries like:
 *   { key: 'name.display',    value: 'Jane Smith' }
 *   { key: 'contact.email',   value: 'jane@example.com' }
 *   { key: 'contact.phone',   value: '+1234567890' }
 *   { key: 'account.type',    value: 'individual' }
 *   { key: 'account.verified', value: 'true' }
 */
export async function buildIdentityDetails(accountId: string): Promise<IdentityDetail[]> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        displayName: true,
        accountType: true,
        isVerified: true,
        individualProfile: { select: { firstName: true, lastName: true, details: true } },
        brandProfile: { select: { brandName: true } },
        contacts: { select: { contactType: true, value: true } },
      },
    });

    if (!account) return [];

    const details: IdentityDetail[] = [];

    // Display name
    const displayName =
      account.brandProfile?.brandName ||
      account.displayName ||
      [account.individualProfile?.firstName, account.individualProfile?.lastName]
        .filter(Boolean)
        .join(' ') ||
      null;

    if (displayName) {
      details.push({ key: 'name.display', value: displayName });
    }

    // First / last name (individual accounts only)
    if (account.individualProfile?.firstName) {
      details.push({ key: 'name.first', value: account.individualProfile.firstName });
    }
    if (account.individualProfile?.lastName) {
      details.push({ key: 'name.last', value: account.individualProfile.lastName });
    }

    // Account metadata
    if (account.accountType) {
      details.push({ key: 'account.type', value: account.accountType });
    }
    details.push({ key: 'account.verified', value: String(account.isVerified ?? false) });

    // Contacts — one entry per contact record
    for (const contact of account.contacts) {
      const key = `contact.${contact.contactType.toLowerCase()}`;
      details.push({ key, value: contact.value });
    }

    return details;
  } catch (error) {
    await logError('auth', error, 'build_identity_details');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Connection auto-creation on silent auth
// ---------------------------------------------------------------------------

/**
 * Ensures a Connection exists for the given account + app.
 * Called during silent auth when the user is authenticated so the app
 * appears in the user's connected-apps list immediately.
 *
 * Uses upsert so it is safe to call on every authenticated whoisthis request.
 */
export async function ensureApplicationConnection(
  accountId: string,
  appId: string
): Promise<void> {
  try {
    const defaultRoleId = await getApplicationDefaultRoleId(appId);
    await prisma.connection.upsert({
      where: { accountId_appId: { accountId, appId } },
      update: {},
      create: { accountId, appId, status: 'active', roleId: defaultRoleId },
    });
  } catch (error) {
    // Non-fatal — log but don't block the auth response
    await logError('auth', error, `ensureApplicationConnection:${accountId}:${appId}`);
  }
}

// ---------------------------------------------------------------------------
// Silent auth code issuance
// ---------------------------------------------------------------------------

/**
 * ::neup.documentation::silent-sso-code-exchange-service
 * ::function exchangeSilentAuthCode(appId, appSecret, code, codeVerifier)
 *
 * Exchanges a silent auth code for authenticated application data.
 *
 * ::public
 *
 * This is the server-side counterpart to the hidden iframe flow.
 *
 * ::public end
 *
 * ::private
 *
 * The function verifies the app credentials, consumes the auth code, validates optional verifier data, and returns the app-scoped response used by the exchange route.
 *
 * ::private end
 *
 * ::param external appId
 * ::datatype string
 * ::required true
 *
 * Application identifier.
 *
 * ::param external appSecret
 * ::datatype string
 * ::required true
 *
 * Application secret.
 *
 * ::param external code
 * ::datatype string
 * ::required true
 *
 * Short-lived silent auth code.
 *
 * ::end
 */
/**
 * Issues a short-lived silent_auth_code stored in AuthnRequest.
 * Returns the code and the resolved Identity.
 */
export async function issueSilentAuthCode(
  accountId: string,
  guestAccountId: string,
  appId: string,
  codeChallenge?: string,
  codeChallengeMethod?: string
): Promise<{ code: string; identity: Identity }> {
  const code = crypto.randomBytes(48).toString('base64url');

  await prisma.authnRequest.create({
    data: {
      id: code,
      type: 'silent_auth_code',
      status: 'pending',
      data: {
        appId,
        guestAccountId,
        ...(codeChallenge
          ? {
              codeChallenge,
              codeChallengeMethod: codeChallengeMethod ?? 'S256',
            }
          : {}),
      },
      accountId,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });

  const identity = await resolveOrCreateIdentity(guestAccountId, appId);

  return { code, identity };
}

// ---------------------------------------------------------------------------
// Silent auth code exchange
// ---------------------------------------------------------------------------

/**
 * Exchanges a silent_auth_code for a full user identity.
 * Validates appId + appSecret, marks code as used, returns WhoAmI-style body.
 */
export async function exchangeSilentAuthCode(
  appId: string,
  appSecret: string,
  code: string,
  codeVerifier?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    // Look up the pending code
    const record = await prisma.authnRequest.findFirst({
      where: { id: code, type: 'silent_auth_code', status: 'pending' },
    });

    if (!record) {
      return { status: 400, body: { success: false, error: 'invalid_code' } };
    }

    if (record.expiresAt <= new Date()) {
      return { status: 400, body: { success: false, error: 'invalid_code' } };
    }

    const data = record.data as {
      appId: string;
      sessionId: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    };

    // Validate appId binding
    if (data.appId !== appId) {
      return { status: 400, body: { success: false, error: 'app_mismatch' } };
    }

    // Validate appSecret
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { appSecret: true },
    });

    if (!application || application.appSecret !== appSecret) {
      return { status: 401, body: { success: false, error: 'unauthorized' } };
    }

    // PKCE verification
    if (data.codeChallenge && codeVerifier) {
      const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      if (hash !== data.codeChallenge) {
        return { status: 400, body: { success: false, error: 'invalid_code_verifier' } };
      }
    }

    // Atomically mark the code as used
    const updated = await prisma.authnRequest.updateMany({
      where: { id: code, status: 'pending' },
      data: { status: 'used' },
    });

    // If nothing was updated, the code was consumed by a concurrent request
    if (updated.count === 0) {
      return { status: 400, body: { success: false, error: 'invalid_code' } };
    }

    // Fetch the account details (same shape as resolveWhoAmI)
    const account = await prisma.account.findUnique({
      where: { id: record.accountId! },
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
      return { status: 400, body: { success: false, error: 'invalid_code' } };
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

    // Log the exchange event (without the code value)
    await logError('auth', `silent_auth_code exchanged for appId=${appId}, outcome=success`, 'exchange_silent_auth_code');

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
    await logError('auth', error, 'exchange_silent_auth_code');
    return { status: 500, body: { success: false, error: 'internal_server_error' } };
  }
}
