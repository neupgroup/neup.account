'use server';

import prisma from '@/core/helpers/prisma';
import { getSessionCookies } from '@/core/helpers/cookies';

export type SessionVerifyResult =
    | { valid: true; accountId: string; isGuest: boolean }
    | { valid: false };

type VerifyActiveSessionOptions = {
    expectedGuest?: boolean;
};

/**
 * Verifies the active session against the database.
 * This is the authoritative check — it cannot be bypassed by client-side cache.
 * Called on every protected page mount to catch remote logouts and expired sessions.
 */
export async function verifyActiveSession(
    options: VerifyActiveSessionOptions = {},
): Promise<SessionVerifyResult> {
    const { accountId, sessionId, sessionKey } = await getSessionCookies();

    if (!accountId || !sessionId || !sessionKey) {
        return { valid: false };
    }

    try {
        const session = await prisma.authnSession.findUnique({
            where: { id: sessionId },
            select: {
                accountId: true,
                key: true,
                validTill: true,
                loginType: true,
                account: {
                    select: {
                        accountType: true,
                        status: true,
                        details: true,
                    },
                },
            },
        });

        if (!session) return { valid: false };

        if (
            session.accountId !== accountId ||
            session.key !== sessionKey ||
            !session.validTill ||
            session.validTill < new Date()
        ) {
            return { valid: false };
        }

        const sessionSaysGuest =
            session.loginType === 'guest' || session.account?.accountType === 'guest';

        if (
            typeof options.expectedGuest === 'boolean' &&
            sessionSaysGuest !== options.expectedGuest
        ) {
            return { valid: false };
        }

        // Check account is not blocked
        const details = session.account?.details as Record<string, any> | null;
        const block = details?.block;
        if (session.account?.status === 'blocked') {
            const isPermanent = block?.is_permanent;
            const until = block?.until ? new Date(block.until) : null;
            if (isPermanent || (until && until > new Date())) {
                return { valid: false };
            }
        }

        return { valid: true, accountId, isGuest: sessionSaysGuest };
    } catch {
        return { valid: false };
    }
}
