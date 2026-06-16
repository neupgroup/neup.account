'use server';

// Provides read/write access to the auth_account cookie.
// The cookie stores a single signed JWT (RS256) representing the current account.
// No account switching — one account per browser session.
//
// Guest accounts have guest: 1 in the payload (and no nid).
// Permanent accounts have a nid.

import { cookieProvider } from '@/core/providers/cookies';
import type { StoredAccount } from '@/core/auth/session';
import {
  signAccountToken,
  verifyAccountToken,
  type AccountTokenPayload,
} from '@/core/auth/accountToken';

const COOKIE_NAME = 'auth_account';

const ACCOUNT_COOKIE_EXPIRY = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
};

const ACCOUNT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function payloadToStoredAccount(p: AccountTokenPayload): StoredAccount {
  return {
    aid: p.aid,
    sid: p.sid,
    skey: p.skey,
    def: 1,
    ...(p.nid ? { nid: p.nid, neupId: p.nid } : {}),
    guest: p.guest,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Reads and verifies the current account token from auth_account.
 * Returns null if the cookie is missing or the token is invalid/tampered.
 */
export async function getAccount(): Promise<StoredAccount | null> {
  const raw = await cookieProvider.getCookie(COOKIE_NAME);
  if (!raw) return null;

  const payload = await verifyAccountToken(raw.trim());
  if (!payload) return null;

  return payloadToStoredAccount(payload);
}

/**
 * Returns the current account ID, or null if not set.
 */
export async function getActiveAccountId(): Promise<string | null> {
  const account = await getAccount();
  return account?.aid ?? null;
}

export async function getManagedAccountId(): Promise<string | null> {
  return null;
}

export async function getEffectiveAccountId(): Promise<string | null> {
  return getActiveAccountId();
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Sets the current account in auth_account as a signed JWT.
 * Replaces any existing account — no array, no switching.
 * Pass nid = '' for guest accounts.
 */
export async function setAccount(
  aid: string,
  sid: string,
  skey: string,
  nid: string
): Promise<void> {
  const isGuest = !nid;

  const payload: AccountTokenPayload = isGuest
    ? { aid, sid, skey, guest: 1 }           // no nid key at all
    : { aid, sid, skey, nid };               // nid present, no guest key

  const token = await signAccountToken(payload);

  await cookieProvider.setCookieRaw(COOKIE_NAME, token, {
    ...ACCOUNT_COOKIE_OPTIONS,
    expires: ACCOUNT_COOKIE_EXPIRY(),
  });
}

/**
 * Clears the auth_account cookie.
 */
export async function clearAccount(): Promise<void> {
  await cookieProvider.setCookieRaw(COOKIE_NAME, '', {
    ...ACCOUNT_COOKIE_OPTIONS,
    expires: new Date(0),
  });
}

// ---------------------------------------------------------------------------
// Legacy compat — keep addAccount as an alias for setAccount
// so existing callers don't break immediately
// ---------------------------------------------------------------------------

export async function addAccount(
  aid: string,
  sid: string,
  skey: string,
  nid: string
): Promise<void> {
  return setAccount(aid, sid, skey, nid);
}

/**
 * Returns the current account as a single-element array.
 * Legacy compat for callers that expect getAccounts() → StoredAccount[].
 */
export async function getAccounts(): Promise<StoredAccount[]> {
  const account = await getAccount();
  return account ? [account] : [];
}
