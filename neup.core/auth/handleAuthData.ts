import type { NextRequest } from 'next/server';
import { verifyAccountToken } from '@/neup.core/auth/accountToken';

/**
 * The three possible outcomes of handleAuthData.
 *
 * create_guest  — No account cookie at all. Redirect to /auth/start.
 *
 * redirect      — Cookie exists but JWT is invalid/tampered, or account is
 *                 a guest (no nid). Cannot access protected pages.
 *
 * permit        — Valid JWT, permanent account (has nid), valid aid/sid/skey.
 */
export type AuthDataResult =
  | { outcome: 'create_guest' }
  | { outcome: 'redirect'; reason: 'guest_account' | 'invalid_token' | 'invalid_session' }
  | { outcome: 'permit'; accountId: string };

/**
 * handleAuthData
 *
 * Reads the auth_account cookie, verifies the JWT with app.public.key,
 * and determines what to do with the request.
 *
 * Edge-compatible — uses Node.js crypto (available in Next.js middleware).
 *
 * Conditions:
 *   1. No cookie                    → create_guest
 *   2. Cookie present, JWT invalid  → redirect (invalid_token)
 *   3. Valid JWT, guest (no nid)    → redirect (guest_account)
 *   4. Valid JWT, missing aid/sid/skey → redirect (invalid_session)
 *   5. Valid JWT, permanent account → permit
 */
export async function handleAuthData(request: NextRequest): Promise<AuthDataResult> {
  const raw = request.cookies.get('auth_account')?.value;

  // Condition 1: No cookie
  if (!raw) {
    return { outcome: 'create_guest' };
  }

  // Verify the JWT with the public key
  const payload = await verifyAccountToken(raw.trim());

  // Condition 2: Invalid/tampered token
  if (!payload) {
    return { outcome: 'redirect', reason: 'invalid_token' };
  }

  const { aid, sid, skey, nid } = payload;

  // Condition 3: Guest account (no nid field)
  if (!nid) {
    return { outcome: 'redirect', reason: 'guest_account' };
  }

  // Condition 4: Missing session fields
  if (!aid || !sid || !skey) {
    return { outcome: 'redirect', reason: 'invalid_session' };
  }

  // Condition 5: Permanent account with valid session
  return { outcome: 'permit', accountId: aid };
}
