import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import crypto from 'crypto';
import type { StoredAccount } from '@/services/account/session';

const GUEST_SESSION_DURATION_DAYS = 365;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Creates a new guest Account + AuthnSession in a single transaction.
 * Writes the guest into the auth_acc cookie as the active account (def: 1).
 *
 * Guest accounts have:
 *   - accountType = 'guest'
 *   - no neupId (nid = '')
 *   - loginType = 'guest' on the session
 */
async function createGuestAccountWithSession(
  linkedAccountId: string | null,
  ipAddress: string,
  userAgent: string
): Promise<{ accountId: string; sessionId: string; sessionKey: string }> {
  const sessionKey = crypto.randomBytes(32).toString('hex');
  const validTill = new Date();
  validTill.setDate(validTill.getDate() + GUEST_SESSION_DURATION_DAYS);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: { accountType: 'guest', linkedAccountId },
      select: { id: true },
    });

    const session = await tx.authnSession.create({
      data: {
        accountId: account.id,
        key: sessionKey,
        ipAddress,
        userAgent,
        lastLoggedIn: new Date(),
        loginType: 'guest',
        validTill,
      },
      select: { id: true },
    });

    return { accountId: account.id, sessionId: session.id };
  });

  return { ...result, sessionKey };
}

/**
 * Resolves or creates a guest account for the current browser.
 *
 * The guest account is stored in the auth_acc cookie as:
 *   { aid: guestAccountId, def: 1, sid: sessionId, skey: sessionKey, nid: '' }
 *
 * This means the proxy's auth check passes for guest accounts — they have
 * a valid aid/sid/skey, just no nid (which identifies them as guests).
 *
 * Rules:
 *   - If auth_acc already has a def:1 account with a nid → real user, skip
 *   - If auth_acc has a def:1 guest (no nid) → reuse if < 30 days, else expire + create new
 *   - If auth_acc is empty or has no def:1 → create a new guest account
 *
 * @param linkedAccountId - Real account to link to (pass null for anonymous)
 */
export async function resolveGuestAccount(
  input: {
    linkedAccountId?: string | null;
    activeAccount?: StoredAccount | null;
    ipAddress: string;
    userAgent: string;
  }
): Promise<{ accountId: string; sessionId: string; sessionKey: string } | null> {
  try {
    const linkedAccountId = input.linkedAccountId ?? null;
    const activeAccount = input.activeAccount ?? null;

    // If there's already a real signed-in user (has nid), don't touch anything
    if (activeAccount?.nid) {
      return null;
    }

    // Check if there's an existing guest account in the cookie
    if (activeAccount && !activeAccount.nid && activeAccount.aid) {
      const existing = await prisma.account.findUnique({
        where: { id: activeAccount.aid },
        select: { accountType: true, status: true, createdAt: true, linkedAccountId: true },
      });

      const isValidGuest =
        existing &&
        existing.accountType === 'guest' &&
        existing.status !== 'expired';

      if (isValidGuest) {
        const ageMs = Date.now() - existing.createdAt.getTime();

        if (ageMs < ONE_MONTH_MS) {
          // Fresh guest — link to real account if provided and not already linked
          if (linkedAccountId && !existing.linkedAccountId) {
            await prisma.account.update({
              where: { id: activeAccount.aid },
              data: { linkedAccountId },
            });
          }
          // Already in auth_acc, nothing more to do
          return null;
        } else {
          // Stale guest — expire it
          await prisma.account.update({
            where: { id: activeAccount.aid },
            data: { status: 'expired' },
          });
          // Fall through to create a new guest below
        }
      }
    }

    // No valid guest in cookie — create a new one and write to auth_acc
    const created = await createGuestAccountWithSession(
      linkedAccountId,
      input.ipAddress,
      input.userAgent,
    );
    return created;
  } catch (error) {
    await logError('auth', error, 'resolve_guest_account');
    return null;
  }
}

/**
 * Expires the current guest account on logout and creates a new anonymous one.
 * Called from logoutActiveSession.
 */
export async function rotateGuestAccountOnLogout(input: {
  activeAccount?: StoredAccount | null;
  ipAddress: string;
  userAgent: string;
}): Promise<{ accountId: string; sessionId: string; sessionKey: string }> {
  try {
    const activeAccount = input.activeAccount ?? null;

    // Expire the current guest account if it exists
    if (activeAccount && !activeAccount.nid && activeAccount.aid) {
      await prisma.account.updateMany({
        where: { id: activeAccount.aid, accountType: 'guest' },
        data: { status: 'expired' },
      });
    }

    // Create a new anonymous guest account and write to auth_acc
    return await createGuestAccountWithSession(null, input.ipAddress, input.userAgent);
  } catch (error) {
    await logError('auth', error, 'rotate_guest_account_on_logout');
    return await createGuestAccountWithSession(null, input.ipAddress, input.userAgent);
  }
}
