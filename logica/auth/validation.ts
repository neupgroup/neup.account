/*
::neup.documentation::logica-auth-validation-module
::title Logica Auth Validation Helpers

Portable helpers for validating `auth_account` token payloads and session triplets.

::public

Use this module when an app needs to verify that an `auth_account` token is well-formed, not expired, and ready for a backing session check.

::public end

::private

The helpers stay dependency-injected on purpose so the `logica` folder can be moved into another app without bringing Next.js, Prisma, or app-local auth services with it.

::private end

::end
*/

export type AuthAccountCookiePayload = {
  aid?: string;
  sid?: string;
  skey?: string;
  accountId?: string;
  sessionId?: string;
  sessionKey?: string;
  nid?: string;
  neupId?: string;
  guest?: boolean | 1;
  exp?: number;
  expiresAt?: string | number | Date;
};

type NormalizedAuthAccountCookiePayload<TPayload extends AuthAccountCookiePayload> = {
  payload: TPayload;
  accountId: string;
  sessionId: string;
  sessionKey: string;
  isGuest: boolean;
};

type ReadAuthAccountCookiePayloadOptions<TPayload extends AuthAccountCookiePayload> = {
  token: string | null | undefined;
  verifyToken: (token: string) => Promise<TPayload | null> | TPayload | null;
  now?: Date;
};

type ValidateAuthAccountCookieSessionOptions<
  TPayload extends AuthAccountCookiePayload,
  TValidationResult extends { valid: boolean },
> = ReadAuthAccountCookiePayloadOptions<TPayload> & {
  expectedGuest?: boolean;
  validateSession: (input: {
    accountId: string;
    sessionId: string;
    sessionKey: string;
    expectedGuest?: boolean;
  }) => Promise<TValidationResult> | TValidationResult;
};

function normalizeExpiryDate(expiresAt: string | number | Date | undefined): Date | null {
  if (!expiresAt) return null;
  const normalized = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

/**
 * ::neup.documentation::logica-auth-validation-expired
 * ::function isAuthAccountCookiePayloadExpired(payload, now)
 *
 * Returns whether a verified `auth_account` payload is already expired.
 *
 * ::public
 *
 * The helper supports standard JWT `exp` claims and optional `expiresAt` payload fields.
 *
 * ::public end
 *
 * ::private
 *
 * Missing expiry fields are treated as non-expiring so legacy cookie payloads remain valid.
 *
 * ::private end
 *
 * ::end
 */
export function isAuthAccountCookiePayloadExpired(
  payload: AuthAccountCookiePayload,
  now: Date = new Date(),
): boolean {
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= now.getTime()) {
    return true;
  }

  const expiresAt = normalizeExpiryDate(payload.expiresAt);
  return expiresAt ? expiresAt.getTime() <= now.getTime() : false;
}

/**
 * ::neup.documentation::logica-auth-validation-read
 * ::function readValidAuthAccountCookiePayload(options)
 *
 * Verifies and normalizes one `auth_account` token payload.
 *
 * ::public
 *
 * The result contains normalized `accountId`, `sessionId`, and `sessionKey` values when the token is valid and not expired.
 *
 * ::public end
 *
 * ::private
 *
 * The verifier callback is supplied by the host app so this helper stays portable across projects with different token-signing implementations.
 *
 * ::private end
 *
 * ::end
 */
export async function readValidAuthAccountCookiePayload<TPayload extends AuthAccountCookiePayload>(
  options: ReadAuthAccountCookiePayloadOptions<TPayload>,
): Promise<NormalizedAuthAccountCookiePayload<TPayload> | null> {
  const token = options.token?.trim();
  if (!token) return null;

  const payload = await options.verifyToken(token);
  if (!payload || isAuthAccountCookiePayloadExpired(payload, options.now)) {
    return null;
  }

  const accountId = payload.accountId ?? payload.aid ?? '';
  const sessionId = payload.sessionId ?? payload.sid ?? '';
  const sessionKey = payload.sessionKey ?? payload.skey ?? '';

  if (!accountId || !sessionId || !sessionKey) {
    return null;
  }

  return {
    payload,
    accountId,
    sessionId,
    sessionKey,
    isGuest: Boolean(payload.guest),
  };
}

/**
 * ::neup.documentation::logica-auth-validation-validate-session
 * ::function validateAuthAccountCookieSession(options)
 *
 * Verifies an `auth_account` token, checks expiry, and validates the backing session.
 *
 * ::public
 *
 * Use this as the portable orchestration point for authenticated cookie-session checks.
 *
 * ::public end
 *
 * ::private
 *
 * The host app still owns the backing session validation callback, which may check a database, cache, or another session store.
 *
 * ::private end
 *
 * ::end
 */
export async function validateAuthAccountCookieSession<
  TPayload extends AuthAccountCookiePayload,
  TValidationResult extends { valid: boolean },
>(
  options: ValidateAuthAccountCookieSessionOptions<TPayload, TValidationResult>,
): Promise<
  | { valid: false }
  | ({
      valid: true;
      validation: TValidationResult;
    } & NormalizedAuthAccountCookiePayload<TPayload>)
> {
  const normalized = await readValidAuthAccountCookiePayload(options);
  if (!normalized) {
    return { valid: false };
  }

  const validation = await options.validateSession({
    accountId: normalized.accountId,
    sessionId: normalized.sessionId,
    sessionKey: normalized.sessionKey,
    expectedGuest: options.expectedGuest,
  });

  if (!validation.valid) {
    return { valid: false };
  }

  return {
    valid: true,
    validation,
    ...normalized,
  };
}
