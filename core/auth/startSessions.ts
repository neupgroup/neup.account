'use server';

import { clearSessionCookies, getSessionCookies } from '@/core/auth/cookies';
import prisma from '@/core/helpers/prisma';
import { makeNotification } from '@/services/notifications';

export async function logoutStoredSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await prisma.authnSession.findUnique({ where: { id: sessionId } });
    if (!session) return { success: false, error: 'Session not found.' };

    await prisma.authnSession.update({
      where: { id: sessionId },
      data: { validTill: new Date() },
    });

    const { sessionId: activeSessionId } = await getSessionCookies();
    if (activeSessionId === sessionId) {
      await clearSessionCookies();
    }

    await makeNotification({
      recipient_id: session.accountId,
      action: 'informative.logout',
      message: 'A session was logged out.',
    });

    return { success: true };
  } catch {
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function removeStoredAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { accountId: activeAccountId } = await getSessionCookies();
    if (accountId === activeAccountId) {
      await clearSessionCookies();
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to remove account from device.' };
  }
}
