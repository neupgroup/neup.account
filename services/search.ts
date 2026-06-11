
'use server';

import { logError } from '@/core/helpers/logger';
import { checkPermissions } from '@/services/user';
import prisma from '@/core/helpers/prisma';

export type SearchResult = {
    id: string;
    type: 'user' | 'permission';
    title: string;
    description: string;
    url: string;
};


// A very basic search function. In a real-world scenario,
// you would use a dedicated search service like Algolia, Typesense, or Elasticsearch.
export async function searchAll(query: string): Promise<SearchResult[]> {
    const lowercasedQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    // Search Users
    const canSearchUsers = await checkPermissions(['root.account.search']);
    if (canSearchUsers) {
        try {
            const accountsByName = await prisma.account.findMany({
                where: {
                    displayName: { contains: lowercasedQuery, mode: 'insensitive' },
                },
                select: { id: true, displayName: true },
                take: 100,
            });

            const neupIds = await prisma.neupId.findMany({
                where: { id: { contains: lowercasedQuery, mode: 'insensitive' } },
                select: { id: true, accountId: true },
                take: 100,
            });

            const accountIdToNeupId = new Map<string, string>();
            for (const n of neupIds) accountIdToNeupId.set(n.accountId, n.id);

            const seenAccounts = new Set<string>();

            for (const acc of accountsByName) {
                const displayName = acc.displayName || '';
                const neupId = accountIdToNeupId.get(acc.id) || '';
                seenAccounts.add(acc.id);
                results.push({
                    id: `user-${acc.id}`,
                    type: 'user',
                    title: displayName || `@${neupId}`,
                    description: neupId ? `@${neupId}` : '',
                    url: `/manage/${acc.id}`,
                });
            }

            for (const n of neupIds) {
                if (seenAccounts.has(n.accountId)) continue;
                const acc = await prisma.account.findUnique({
                    where: { id: n.accountId },
                    select: { id: true, displayName: true },
                });
                if (!acc) continue;
                const displayName = acc.displayName || '';
                results.push({
                    id: `user-${acc.id}`,
                    type: 'user',
                    title: displayName || `@${n.id}`,
                    description: `@${n.id}`,
                    url: `/manage/${acc.id}`,
                });
            }
        } catch (error) {
            await logError('database', error, 'searchAll:users');
        }
    }

    // Search Permissions
    const canSearchPermissions = await checkPermissions(['root.permission.view']);
    if (canSearchPermissions) {
        try {
            const permissions = await prisma.authzPermission.findMany({
                where: {
                    appId: 'neup.account',
                    name: { contains: lowercasedQuery, mode: 'insensitive' },
                },
                select: { name: true, tag: true },
                take: 50,
            });

            for (const cap of permissions) {
                results.push({
                    id: `permission-${cap.name}`,
                    type: 'permission',
                    title: cap.name,
                    description: cap.tag === null ? '' : JSON.stringify(cap.tag),
                    url: `/manage/access/${cap.name}`,
                });
            }
        } catch (error) {
            await logError('database', error, 'searchAll:permissions');
        }
    }
    
    return results;
}
