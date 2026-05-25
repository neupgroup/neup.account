'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

const APP_ID = 'neup.account';
const DEFAULT_ROLE_NAME = 'individual.default';

/**
 * Assigns the `individual.default` role to a newly created account.
 *
 * Looks up the role by name + appId, then creates a self-grant
 * (accessTo = memberId = accountId). Safe to call inside or
 * outside a transaction — silently no-ops if the role doesn't exist yet.
 */
export async function assignDefaultRole(accountId: string): Promise<void> {
    try {
        const role = await prisma.authzRole.findFirst({
            where: { name: DEFAULT_ROLE_NAME, appId: APP_ID },
            select: { id: true },
        });

        if (!role) {
            // Role hasn't been seeded yet — log and continue rather than hard-fail signup
            await logError(
                'database',
                new Error(`Role "${DEFAULT_ROLE_NAME}" not found for app "${APP_ID}"`),
                `assignDefaultRole:${accountId}`,
            );
            return;
        }

        // Upsert-style: only create if the grant doesn't already exist
        const existing = await prisma.member.findFirst({
            where: {
                accessTo: accountId,
                memberId: accountId,
                roleId: role.id,
                appId: APP_ID,
            },
            select: { id: true },
        });

        if (!existing) {
            await prisma.member.create({
                data: {
                    accessTo: accountId,
                    memberId: accountId,
                    roleId: role.id,
                    appId: APP_ID,
                },
            });
        }
    } catch (error) {
        await logError('database', error, `assignDefaultRole:${accountId}`);
    }
}
