'use server';

import prisma from '@/core/database/prisma';

/*
::neup.documentation::signout-service
::title External Signout Service

Invalidates external application session values.

::public

This file is used when an external application wants Neup.Account to expire an app session by its session value.

::public end

::private

The session lookup is keyed by the stored auth session `key`, with optional `appId` scoping for authorization.

::private end

::end
*/

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
    return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
}


/**
 * ::neup.documentation::bridge-signout-external-session
 * ::function bridgeSignoutExternalSession(input)
 *
 * Invalidates an external application session value.
 *
 * ::public
 *
 * Use this helper to expire a previously issued external app session by its `sessionValue`.
 *
 * ::public end
 *
 * ::private
 *
 * If `appId` is supplied, the service verifies that the session belongs to that app-specific login type before expiring it.
 *
 * ::private end
 *
 * ::end
 */
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
