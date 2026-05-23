'use server';

import { redirect } from 'next/navigation';
import { authCookies, getSessionCookies } from '@/core/helpers/cookies';
import { verifyActiveSession } from '@/services/auth/verify';

type RequireValidSessionOptions = {
  redirectTo?: string;
  allowGuest?: boolean;
};

// Server-side auth guard for protected pages/layouts.
// Redirects immediately when the active session is missing/invalid.
export async function requireValidSession(
  options: RequireValidSessionOptions = {},
) {
  const redirectTo = options.redirectTo ?? '/auth/start';
  const allowGuest = options.allowGuest ?? false;

  // Determine guest mode from cookie signals.
  const rawGuestCookie = (await authCookies.get('guest'))?.trim().toLowerCase();
  const cookieFlagGuest = rawGuestCookie === '1' || rawGuestCookie === 'true';
  const { allAccounts } = await getSessionCookies();
  const tokenFlagGuest = Boolean(allAccounts[0]?.guest);
  const isGuestUser = cookieFlagGuest || tokenFlagGuest;

  // Validate session against DB, including expected guest-vs-non-guest mode.
  const session = await verifyActiveSession({ expectedGuest: isGuestUser });

  if (!session.valid || (!allowGuest && isGuestUser)) {
    redirect(redirectTo);
  }

  return session;
}
