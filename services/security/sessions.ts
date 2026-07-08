'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getActiveSession } from '@/core/auth/verify';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/core/helpers/logger';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

const servicePermissions = [
    permission('security.login_devices.view', 'for_individual', 'service'),
];

export type ManagedSession = {
    id: string;
    ipAddress: string;
    userAgent: string;
    lastLoggedIn: string;
    loginType: string;
    geolocation?: string;
};

/**
 * Function getUserSessions.
 */
export async function getUserSessions(): Promise<ManagedSession[]> {
    await requireAnyPermission404(['security.login_devices.view']);
    try {
        const accountId = await getActiveAccountId();
        if (!accountId) {
            return [];
        }

        const sessions = await prisma.authnSession.findMany({
            where: {
                accountId: accountId,
                validTill: { gt: new Date() }
            },
            orderBy: {
                lastLoggedIn: 'desc'
            }
        });
        
        const formattedSessions: ManagedSession[] = sessions.map(session => {
            return {
                id: session.id,
                ipAddress: session.ipAddress || 'Unknown IP',
                userAgent: session.userAgent || 'Unknown Device',
                lastLoggedIn: session.lastLoggedIn.toLocaleString(),
                loginType: session.loginType || 'unknown',
                geolocation: session.geolocation || undefined,
            };
        });

        return formattedSessions;
        
    } catch (error) {
        await logError('database', error, `getUserSessions`);
        return [];
    }
}


/**
 * Function logoutSessionById.
 */
export async function logoutSessionById(sessionId: string): Promise<{ success: boolean, error?: string }> {
    await requireAnyPermission404(['security.login_devices.view']);
    if (!sessionId) {
        return { success: false, error: "Session ID is required." };
    }
    try {
        await prisma.$transaction([
            prisma.authnSession.update({
                where: { id: sessionId },
                data: { validTill: new Date() }
            })
        ]);
        
        const accountId = await getActiveAccountId();
        if (accountId) {
            await logActivity(accountId, `Remote Logout of Session ${sessionId}`, 'Success');
        }

        return { success: true };
    } catch (error) {
        await logError('database', error, `logoutSessionById: ${sessionId}`);
        return { success: false, error: "Failed to log out session." };
    }
}


/**
 * Function logoutAllOtherSessions.
 */
export async function logoutAllOtherSessions(): Promise<{ success: boolean, error?: string }> {
    await requireAnyPermission404(['security.login_devices.view']);
    try {
        const currentSession = await getActiveSession();
        if (!currentSession) {
            return { success: false, error: "No active session found." };
        }
        const { accountId, sessionId: currentSessionId } = currentSession;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Get all other session IDs
            const otherSessions = await tx.authnSession.findMany({
                where: {
                    accountId: accountId,
                    validTill: { gt: new Date() },
                    id: { not: currentSessionId }
                },
                select: { id: true }
            });
            const otherSessionIds = otherSessions.map(s => s.id);

            // 2. Expire all other sessions
            const updateResult = await tx.authnSession.updateMany({
                where: {
                    id: { in: otherSessionIds }
                },
                data: { validTill: new Date() }
            });

            return updateResult;
        });

        const sessionsLoggedOut = result.count;

        if (sessionsLoggedOut > 0) {
            await logActivity(accountId, `Remotely logged out of ${sessionsLoggedOut} other sessions.`, 'Success');
        }

        return { success: true };
    } catch (error) {
        await logError('database', error, 'logoutAllOtherSessions');
        return { success: false, error: "Failed to log out other sessions." };
    }
}
