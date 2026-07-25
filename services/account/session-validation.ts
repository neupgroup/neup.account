/*
::neup.documentation::account-session-validation-service
::title Account Session Validation Service

Validates auth-account cookie payloads before checking the backing session.

::public

Use this service to verify an `auth_account` token, normalize its account/session fields, and validate the active session record.

::public end

::private

This logic belongs to the account application because the token verifier and active-session backing store are app services, not portable Logica SDK behavior.

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
