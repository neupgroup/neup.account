'use server';

import { redirect } from 'next/navigation';
import { verifyActiveSession } from '@/services/auth/verify';

type RequireValidSessionOptions = {
  redirectTo?: string;
};

// Server-side auth guard for protected pages/layouts.
// Redirects immediately when the active session is missing/invalid.
export async function requireValidSession(
  options: RequireValidSessionOptions = {},
) {
  const redirectTo = options.redirectTo ?? '/auth/start';
  const session = await verifyActiveSession();

  if (!session.valid) {
    redirect(redirectTo);
  }

  return session;
}
