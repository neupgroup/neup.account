'use server';

// Manages the auth_accounts cookie array and all account-switching logic.
// This is the main session layer — it creates sessions, validates stored accounts,
// and handles switching between personal, brand, dependent, and delegated contexts.

import prisma from '@/core/helpers/prisma';
import crypto from 'crypto';

import { logError } from '@/core/helpers/logger';

// Represents an active session with both shorthand and legacy field names.
export type Session = {
  aid?: string;
  sid?: string;
  skey?: string;
  accountId: string;
  sessionId: string;
  sessionKey: string;
  jwt?: string;
};

// Represents one account entry stored in the auth_accounts cookie.
// def: 1 means this is the currently active account.
export type StoredAccount = {
  aid: string;
  sid?: string;
  skey?: string;
  def: 0 | 1;
  nid?: string;
  neupId?: string; // legacy compat — kept so callers that read neupId still work
  guest?: 1;       // only present on guest accounts (accountType = 'guest', no nid)
  isBrand?: boolean;
  isUnknown?: boolean;
  // legacy aliases — kept for backward compat with callers that use the old field names
  accountId?: string;
  sessionId?: string;
  sessionKey?: string;
  expired?: boolean;
  displayName?: string;
  displayPhoto?: string;
  isDependent?: boolean;
  accountType?: string;
};

import { setStoredAccountsCookie, getSessionCookies } from '@/core/auth/cookies';
import { getUserNeupIds, validateNeupId } from '@/services/user';

const SESSION_DURATION_DAYS = 30;

// Normalizes a stored account by resolving legacy field aliases into canonical fields.
function normalizeStoredAccount(account: StoredAccount): StoredAccount {
  const sid = account.sid ?? account.sessionId;
  const skey = account.skey ?? account.sessionKey;
  const aid = account.aid ?? account.accountId ?? '';
  const nid = account.nid || account.neupId || '';

  return {
    ...account,
    aid,
    sid,
    skey,
    def: account.def ?? 0,
    nid,
    neupId: nid,
  };
}

// Creates a new auth session in the database and writes it to the auth_accounts cookie.
// Marks all other stored accounts as inactive (def: 0) and removes any previous
// session for the same accountId before adding the new one.
export async function createAndSetSession(
  accountId: string,
  loginType: string,
  ipAddress: string,
  userAgent: string,
  geolocation?: string
) {
  try {
    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + SESSION_DURATION_DAYS);
    const sessionKey = crypto.randomUUID();

    const session = await prisma.authnSession.create({
      data: {
        accountId: accountId,
        key: sessionKey,
        ipAddress: ipAddress,
        userAgent: userAgent,
        validTill: expiresOn,
        lastLoggedIn: new Date(),
        loginType: loginType,
        geolocation: geolocation,
      },
    });

    const neupIds = await getUserNeupIds(accountId);
    const primaryNeupId = neupIds[0];

    const { setAccount } = await import('@/core/auth/accounts');
    await setAccount(accountId, session.id, sessionKey, primaryNeupId ?? '');

  } catch (error) {
    await logError('auth', error, `createAndSetSession for ${accountId}`);
    throw new Error('Failed to create session.');
  }
}

// Returns all accounts stored in the auth_accounts cookie, normalized.
export async function getStoredAccounts(): Promise<StoredAccount[]> {
  const { allAccounts } = await getSessionCookies();
  return allAccounts.map(normalizeStoredAccount);
}

// Returns all stored accounts, but validates the active account (def: 1) against the DB.
// If the active session is expired or invalid, it is demoted to def: 0.
export async function getValidatedStoredAccounts(): Promise<StoredAccount[]> {
  const { allAccounts } = await getSessionCookies();
  if (allAccounts.length === 0) {
    return [];
  }

  const validatedAccounts = await Promise.all(
    allAccounts.map(async (rawAccount: StoredAccount) => {
      const account = normalizeStoredAccount(rawAccount);

      // Only validate the active account — inactive ones are trusted as-is
      if (account.def !== 1) return account;
      if (!account.sid || !account.skey) return { ...account, def: 0 as const };

      try {
        const session = await prisma.authnSession.findUnique({
          where: { id: account.sid },
          select: {
            id: true,
            accountId: true,
            key: true,
            validTill: true,
          },
        });

        if (!session) return { ...account, def: 0 as const, sid: undefined, skey: undefined };

        const dbValidTill = session.validTill;
        const dbKey = session.key;

        const isInvalid =
          !dbValidTill ||
          dbValidTill < new Date() ||
          session.accountId !== account.aid ||
          !dbKey ||
          dbKey !== account.skey;

        if (isInvalid) {
            return { ...account, def: 0 as const, sid: undefined, skey: undefined };
        }

        return account;

      } catch (e) {
        await logError('database', e, 'getValidatedStoredAccounts');
        return { ...account, def: 0 as const, sid: undefined, skey: undefined };
      }
    })
  );
  return validatedAccounts;
}

// Validates all stored accounts, strips session keys from expired ones,
// and removes any accounts that no longer exist in the database.
export async function cleanupExpiredStoredSessions(): Promise<StoredAccount[]> {
  const validatedAccounts = await getValidatedStoredAccounts();

  const cleanedAccounts = validatedAccounts
    .map((rawAccount) => {
      const account = normalizeStoredAccount(rawAccount);
      if (account.def === 1 || account.sid) {
        return account;
      }
      // Strip session keys from accounts with no valid session
      const { sid: _sid, skey: _skey, sessionId: _sessionId, sessionKey: _sessionKey, ...rest } = account;
      return { ...rest, def: 0 as const } as StoredAccount;
    })
    .filter((account) => Boolean(account?.aid));

  let prunedAccounts = cleanedAccounts;
  try {
    // Remove accounts whose IDs no longer exist in the database
    const uniqueIds = Array.from(new Set(prunedAccounts.map((account) => account.aid).filter(Boolean)));
    if (uniqueIds.length > 0) {
      const existing = await prisma.account.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((entry) => entry.id));
      prunedAccounts = prunedAccounts.filter((account) => existingIds.has(account.aid));
    }
  } catch (error) {
    await logError('database', error, 'cleanupExpiredStoredSessions');
  }

  await setStoredAccountsCookie(prunedAccounts);
  return prunedAccounts;
}

// Validates the given account's session against the DB, then sets it as the active
// account (def: 1) in the cookie.
export async function switchToAccount(account: StoredAccount) {
    if (!account.sid || !account.skey) {
        return { success: false, error: 'Invalid session information. Please sign in.' };
    }
    
    const expiresOn = new Date();
    expiresOn.setDate(expiresOn.getDate() + SESSION_DURATION_DAYS);
    
    try {
        const session = await prisma.authnSession.findUnique({
          where: { id: account.sid },
          select: {
            id: true,
            accountId: true,
            key: true,
            validTill: true,
          },
        });

        if (
          !session ||
          session.accountId !== account.aid ||
          !session.key ||
          session.key !== account.skey ||
          !session.validTill ||
          session.validTill < new Date()
        ) {
            return { success: false, error: 'Invalid or expired session.' };
        }

        const { allAccounts } = await getSessionCookies();
        const updatedAccounts = allAccounts.map((acc: StoredAccount) => ({
            ...acc,
            def: (acc.aid === account.aid ? 1 : 0) as 0 | 1,
        }));
        await setStoredAccountsCookie(updatedAccounts);

        return { success: true };
    } catch (error) {
        await logError('database', error, `switchActiveAccount: ${account.aid}`);
        return { success: false, error: 'An unexpected error occurred.' };
    }
}

// Looks up a stored account by NeupID and switches to it if the session is valid.
export async function switchToAccountByNeupId(neupId: string): Promise<{ success: boolean; error?: string }> {
  const normalizedNeupId = neupId.toLowerCase().trim();

  const validity = await validateNeupId(normalizedNeupId);
  if (!validity.success) {
    return { success: false, error: validity.error || 'Invalid NeupID.' };
  }

  const accounts = await getValidatedStoredAccounts();
  const matchedAccount = accounts.find(
    (account) => (account.nid || account.neupId)?.toLowerCase() === normalizedNeupId
  );

  if (!matchedAccount) {
    return { success: false, error: 'No stored session found for this NeupID.' };
  }

  if (!matchedAccount.sid || !matchedAccount.skey || matchedAccount.def !== 1) {
    return { success: false, error: 'Stored session is missing or expired.' };
  }

  return switchToAccount(matchedAccount);
}

// Selected-account state is URL-driven on the client.
export async function switchToBrand(brandId: string) {
  return { success: true };
}

// Selected-account state is URL-driven on the client.
export async function switchToDependent(dependentId: string) {
  return { success: true };
}

// Selected-account state is URL-driven on the client.
export async function switchToDelegated(accountId: string) {
  return { success: true };
}

// Selected-account state is URL-driven on the client.
export async function switchToPersonal() {
  return;
}
