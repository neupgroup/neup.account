'use server';

/**
 * ::neup.documentation::account-session-cookies-service
 * ::title Account Session Cookies Service
 *
 * Cookie read and write helpers for the account auth session token.
 *
 * ::public
 *
 * This service reads, sets, and clears the `auth_account` cookie that stores the active account session token and legacy account-session compatibility data.
 *
 * ::public end
 *
 * ::private
 *
 * Cookie payloads are translated into the account app's `StoredAccount` shape and signed through the account auth token service.
 *
 * ::private end
 *
 * ::end
 */

import { cookies } from 'next/headers';
import { getCookie, setCookies } from '@/core/helpers/cookie';
import { signAccountToken, verifyAccountToken } from '@/services/auth/account-token';

export type StoredAccount = {
  aid: string;
  sid?: string;
  skey?: string;
  def: 0 | 1;
  nid?: string;
  neupId?: string;
  guest?: 1;
};

export type Session = {
  aid?: string;
  sid?: string;
  skey?: string;
  accountId?: string;
  sessionId?: string;
  sessionKey?: string;
};

type SessionCookiePayload = {
  aid: string;
  sid: string;
  skey: string;
  jwt?: string;
  accountId: string;
  sessionId: string;
  sessionKey: string;
  allAccounts: StoredAccount[];
};

const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
  httpOnly: true,
};

const LONG_LIVED_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
};

function getEmptySessionCookiePayload(): SessionCookiePayload {
  return {
    aid: '',
    sid: '',
    skey: '',
    jwt: undefined,
    accountId: '',
    sessionId: '',
    sessionKey: '',
    allAccounts: [],
  };
}

export async function getSessionCookies(): Promise<SessionCookiePayload> {
  const raw = await getCookie('auth_account');
  if (!raw) {
    return getEmptySessionCookiePayload();
  }

  try {
    const payload = await verifyAccountToken(raw);

    if (!payload?.aid || !payload.sid || !payload.skey) {
      return getEmptySessionCookiePayload();
    }

    const account = {
      aid: payload.aid,
      sid: payload.sid,
      skey: payload.skey,
      def: 1 as const,
      nid: payload.nid ?? payload.neupId ?? '',
      neupId: payload.neupId ?? payload.nid ?? '',
      guest: payload.guest,
    } satisfies StoredAccount;

    return {
      aid: account.aid,
      sid: account.sid ?? '',
      skey: account.skey ?? '',
      jwt: undefined,
      accountId: account.aid,
      sessionId: account.sid ?? '',
      sessionKey: account.skey ?? '',
      allAccounts: [account],
    };
  } catch {
    return getEmptySessionCookiePayload();
  }
}

export async function setSessionCookies(session: Session, _expires: Date): Promise<void> {
  const aid = session.aid || session.accountId;
  const sid = session.sid || session.sessionId;
  const skey = session.skey || session.sessionKey;

  if (!aid || !sid || !skey) {
    throw new Error('Missing session values for cookie set.');
  }

  const existing = await getSessionCookies();
  const nid = existing.allAccounts[0]?.nid || '';
  await setStoredAccountsCookie([{ aid, sid, skey, nid, def: 1 }]);
}

export async function setStoredAccountsCookie(accounts: StoredAccount[]): Promise<void> {
  const active = accounts.find((account) => account.def === 1) ?? accounts[0];
  if (!active) return;

  const isGuest = !active.nid && !active.neupId;

  const token = await signAccountToken(
    isGuest
      ? { aid: active.aid, sid: active.sid ?? '', skey: active.skey ?? '', guest: 1 }
      : { aid: active.aid, sid: active.sid ?? '', skey: active.skey ?? '', nid: active.nid ?? active.neupId ?? '' },
  );

  await setCookies('auth_account', token, LONG_LIVED_COOKIE_OPTIONS);
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();

  store.delete('auth_account');

  const legacyCookieNames = [
    'auth_account_switch',
    'auth_acc',
    'auth_aid',
    'auth_sid',
    'auth_skey',
    'auth_jwt',
    'auth_account_id',
    'auth_session_id',
    'auth_session_key',
    'auth_permit',
    'profile_name',
    'profile_neupid',
  ] as const;

  legacyCookieNames.forEach((name) => {
    store.delete(name);
  });
}
