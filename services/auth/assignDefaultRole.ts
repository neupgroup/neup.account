'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';

const APP_ID = 'neup.account';
const DEFAULT_ROLE_NAME = 'individual.default';

/**
 * Assigns the `individual.default` role to a newly created account.
 *
 * Looks up the role by name + appId, then creates self member/asset/access rows.
 * Safe to call inside or
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

        await prisma.$transaction(async (tx) => {
            await cleanupExpiredAccessModel(tx);
            await ensureAccessGrant(tx, {
                memberAccountId: accountId,
                parentAccountId: accountId,
                childApplicationId: APP_ID,
                accessApplicationId: APP_ID,
                roleId: role.id,
            });
        });
    } catch (error) {
        await logError('database', error, `assignDefaultRole:${accountId}`);
    }
}
