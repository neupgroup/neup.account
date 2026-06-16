'use server';

import prisma from '@/core/helpers/prisma';

const EXTERNAL_LOGIN_PREFIX = 'external_app:';
function externalLoginType(appId: string) {
    return `${EXTERNAL_LOGIN_PREFIX}${appId}`;
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
