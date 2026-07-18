
'use server';

import { permission } from '@/logica/permission';
import { logError } from '@/logica/logger/files';
import { checkPermissions } from '@/services/user';
import prisma from '@/core/database/prisma';

const servicePermissions = [
    permission('root.account.search', 'for_individual', 'service'),
    permission('root.permission.view', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::search-service-module
 * ::title Global Search Service
 *
 * Provides the lightweight cross-entity search used by manage surfaces.
 *
 * ::public
 *
 * This service currently searches user accounts and account-app permission records and returns a normalized result list.
 *
 * ::public end
 *
 * ::private
 *
 * The implementation is intentionally simple and database-backed; it does not use a dedicated search index.
 *
 * ::private end
 *
 * ::end
 */
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
    /**
     * ::neup.documentation::search-service-search-all
     * ::function searchAll(query)
     *
     * Searches supported manage entities for the supplied query string.
     *
     * ::public
     *
     * Results can include users and permissions, depending on the caller's permissions.
     *
     * ::public end
     *
     * ::private
     *
     * User search combines display-name matches and NeupID matches; permission search scans `authzPermission` rows for the `neup.account` app.
     *
     * ::private end
     *
     * ::end
     */
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
