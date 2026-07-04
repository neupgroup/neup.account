'use server';

import { cookies } from 'next/headers';
import { getCookie, setCookies } from '@/core/helper/cookieHelper';
import type { StoredAccount, Session } from '@/core/auth/session';
import { readValidAuthAccountCookiePayload } from '@/logica/auth/validation';

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
    const { verifyAccountToken } = await import('@/core/auth/accountToken');
    const normalized = await readValidAuthAccountCookiePayload({
      token: raw,
      verifyToken: verifyAccountToken,
    });

    if (!normalized) {
      return getEmptySessionCookiePayload();
    }

    const account = {
      aid: normalized.accountId,
      sid: normalized.sessionId,
      skey: normalized.sessionKey,
      def: 1 as const,
      nid: normalized.payload.nid ?? normalized.payload.neupId ?? '',
      neupId: normalized.payload.neupId ?? normalized.payload.nid ?? '',
      guest: normalized.payload.guest,
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

  const { setAccount } = await import('@/core/auth/accounts');
  const existing = await getSessionCookies();
  const nid = existing.allAccounts[0]?.nid || '';
  await setAccount(aid, sid, skey, nid);
}

export async function setStoredAccountsCookie(accounts: StoredAccount[]): Promise<void> {
  const active = accounts.find((account) => account.def === 1) ?? accounts[0];
  if (!active) return;

  const { signAccountToken } = await import('@/core/auth/accountToken');
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
