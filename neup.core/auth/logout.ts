'use server';

import { headers } from 'next/headers';
import { clearSessionCookies, getSessionCookies, setStoredAccountsCookie } from '@/neup.core/auth/cookies';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { expireSession } from '@/services/auth/session';
import { rotateGuestAccountOnLogout } from '@/neup.core/auth/guestAccount';
import { activityAction } from '@/services/activity-action';

export async function logoutActiveSession() {
  const { sid, aid, allAccounts } = await getSessionCookies();
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') || 'Unknown IP';

  if (sid && aid) {
    try {
      const expireResult = await expireSession({
        aid,
        sid,
        skey: allAccounts.find((acc) => acc.sid === sid)?.skey || '',
      });

      if (!expireResult.success) {
        await logError('auth', expireResult.error || 'Unknown error', 'logoutActiveSession:expireSession');
      }

      await logActivity(aid, activityAction.logout(), 'Success', ipAddress);

      if (allAccounts.length > 0) {
        const updatedAccounts = allAccounts.map((acc) =>
          acc.sid === sid
            ? {
                ...acc,
                sid: undefined,
                skey: undefined,
                def: 0 as const,
              }
            : acc,
        );
        await setStoredAccountsCookie(updatedAccounts);
      }
    } catch (error) {
      await logError('database', error, 'logoutActiveSession:updateDoc');
    }
  }

  await rotateGuestAccountOnLogout();
  await clearSessionCookies();
}
