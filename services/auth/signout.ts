'use server';

import prisma from '@/core/helpers/prisma';
import { logActivity } from '@/services/log-actions';
import { headers } from 'next/headers';
import { logError } from '@/core/helpers/logger';
import { getSessionCookies, clearSessionCookies, setStoredAccountsCookie } from '@/core/auth/cookies';
import { expireSession } from './session';
import { rotateGuestAccountOnLogout } from './guestAccount';
import { activityAction } from '@/services/activity-action';

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
    return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}

/**
 * Function logoutActiveSession.
 */
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
                const updatedAccounts = allAccounts.map(acc => {
                    if (acc.sid === sid) {
                        return {
                            ...acc,
                            sid: undefined,
                            skey: undefined,
                            def: 0 as const,
                        };
                    }
                    return acc;
                });
                await setStoredAccountsCookie(updatedAccounts);
            }

        } catch (error) {
            await logError('database', error, 'logoutActiveSession:updateDoc');
        }
    }

    // Expire the current guest account and issue a new anonymous one
    await rotateGuestAccountOnLogout();

    await clearSessionCookies();
}


/**
 * Function bridgeSignoutExternalSession.
 */
export async function bridgeSignoutExternalSession(input: {
    sessionValue?: string;
    appId?: string;
}): Promise<{ status: number; body: { success: boolean; error?: string; message?: string } }> {
    const { sessionValue, appId } = input;

    if (!sessionValue) {
        return { status: 400, body: { success: false, error: 'sessionValue is required.' } };
    }

    try {
        const appSession = await prisma.authnSession.findFirst({
            where: {
                key: sessionValue,
            },
        });

        if (appSession) {
            if (appId && appSession.loginType !== externalLoginType(appId)) {
                return { status: 403, body: { success: false, error: 'Unauthorized session.' } };
            }

            await prisma.authnSession.update({
                where: { id: appSession.id },
                data: {
                    validTill: new Date(),
                },
            });
        }

        return { status: 200, body: { success: true, message: 'Signed out successfully.' } };
    } catch {
        return { status: 500, body: { success: false, error: 'Internal server error.' } };
    }
}
