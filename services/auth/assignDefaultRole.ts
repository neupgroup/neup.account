'use server';

import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import { roleMatchesAssignmentModesPolicy } from '@/services/applications/authz-scope-policy';

const APP_ID = 'neup.account';
const DEFAULT_ROLE_NAME = 'individual.default';

/**
 * Assigns the `individual.default` role to a newly created account when its scope applies.
 *
 * Looks up the role by name + appId, then creates self member/asset/access rows.
 * Safe to call inside or
 * outside a transaction — silently no-ops if the role doesn't exist yet.
 */
export async function assignDefaultRole(accountId: string): Promise<void> {
    try {
        const [account, role] = await Promise.all([
            prisma.account.findUnique({
                where: { id: accountId },
                select: { accountType: true },
            }),
            prisma.authzRole.findFirst({
                where: { name: DEFAULT_ROLE_NAME, appId: APP_ID },
                select: { id: true, scopeFor: true, scopeLevel: true },
            }),
        ]);

        if (!role) {
            // Role hasn't been seeded yet — log and continue rather than hard-fail signup
            await logError(
                'database',
                new Error(`Role "${DEFAULT_ROLE_NAME}" not found for app "${APP_ID}"`),
                `assignDefaultRole:${accountId}`,
            );
            return;
        }
        if (!account) return;
        if (!roleMatchesAssignmentModesPolicy({
            accountType: account.accountType,
            scopeFor: role.scopeFor,
            scopeLevel: role.scopeLevel,
            modes: ['manageable', 'public', 'toApprove'],
        })) {
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
