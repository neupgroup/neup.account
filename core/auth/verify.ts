'use server';

// Handles server-side session verification and account ID resolution.
// These are the lowest-level auth primitives — everything that needs to know
// "who is logged in" calls into this file.

import { redirect } from 'next/navigation';
import { verifyActiveSession } from '@/services/auth/verify';
import { getSessionCookies } from '@/core/auth/cookies';
import { getAccountSelectorContext } from '@/core/auth/accountSelector';
import { getCookie } from '@/core/helper/cookieHelper';
import { validateAuthAccountCookieSession } from '@/logica/auth/validation';

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

type GetActiveSessionOptions = {
  expectedGuest?: boolean;
};

// Returns true if the three required session cookie values exist on the device.
// This is a cookie-only check — it does not validate against the database.
export async function hasActiveSessionCookies(): Promise<boolean> {
  const { accountId, sessionId, sessionKey } = await getSessionCookies();
  return Boolean(accountId && sessionId && sessionKey);
}

// Reads the session from cookies and validates it against the database via services/auth/verify.
// Returns null if the session is missing, expired, or tampered with.
export async function getActiveSession(options: GetActiveSessionOptions = {}): Promise<Session | null> {
  const rawToken = await getCookie('auth_account');
  const { verifyAccountToken } = await import('@/core/auth/accountToken');
  const result = await validateAuthAccountCookieSession({
    token: rawToken,
    verifyToken: verifyAccountToken,
    validateSession: verifyActiveSession,
    expectedGuest: options.expectedGuest,
  });
  if (!result.valid) return null;

  return {
    aid: result.accountId,
    sid: result.sessionId,
    skey: result.sessionKey,
    accountId: result.accountId,
    sessionId: result.sessionId,
    sessionKey: result.sessionKey,
  };
}

// Validates the current session and redirects to signout if it is invalid.
// Use this in server components or route handlers that require authentication.
export async function validateCurrentSession() {
  const session = await getActiveSession();
  
  if (!session) {
    redirect('/auth/signout?error=session_expired&error_description=Your session has expired. Please sign in again.');
  }
  
  return session;
}

export async function getActiveAccountId(selectedAccountId?: string | null): Promise<string | null> {
    const { activeAccountId } = await getAccountSelectorContext(selectedAccountId);
    return activeAccountId;
}

// Always returns the personal (logged-in) account ID, regardless of managing context.
export async function getPersonalAccountId(): Promise<string | null> {
    const { personalAccountId } = await getAccountSelectorContext();
    return personalAccountId;
}

// Placeholder for future server-side session refresh logic.
// Profile and permission refreshing is currently handled client-side by SessionProvider.
export async function refreshSessionData(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
}
