// @ts-nocheck
'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import type { StoredAccount } from '@/core/auth/session';
import { resolveDisplayImage } from '@/core/helpers/display-image';
import { cleanupExpiredAccessModel, extractRolePermissionNames } from '@/services/access-model';
import type { Prisma } from '@/prisma/generated/client/client';

export type UserStats = {
    totalUsers: number;
    activeUsers: number;
    signedUpToday: number;
    permissionsDefined: number;
};

/**
 * Type AccountListItem.
 */
export type AccountListItem = {
    id: string;
    name: string;
    dateCreated: string;
    accountType: string;
    isRoot: boolean;
    roles: string[];
    permissions: string[];
};

/**
 * Type GetAccountsResponse.
 */
export type GetAccountsResponse = {
    accounts: AccountListItem[];
    hasNextPage: boolean;
};

/**
 * Type AccountBasics.
 */
export type AccountBasics = {
    id: string;
    displayName: string | null;
    displayImage: string | null;
    status: string | null;
    isVerified: boolean;
    accountType: string;
    lastActivityAt: Date | null;
    neupId: string | null;
};

/**
 * Type AccountBasicsWithPermissions - extends AccountBasics with permissions array.
 */
export type AccountBasicsWithPermissions = AccountBasics & {
    permissions: string[];
};

/**
 * Type AccessibleAccount - extends StoredAccount with display fields.
 */
export type AccessibleAccount = StoredAccount & {
    displayName: string;
    displayPhoto?: string;
    isBrand: boolean;
    isDependent: boolean;
    accountType: string;
    active: boolean;
};


/**
 * Function getAccessibleAccounts.
 *
 * Returns accounts that the current personal account has been granted access to.
 * Deduplicates by accessTo to prevent duplicate entries.
 */
export async function getAccessibleAccounts(): Promise<AccessibleAccount[]> {
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) return [];

    try {
        await cleanupExpiredAccessModel();

        const grants = await prisma.access.findMany({
            where: {
                memberAccountId: personalAccountId,
                parentAccountId: { not: null },
                status: 'active',
                OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
                role: {
                    appId: 'neup.account',
                },
            },
            include: {
                parentAccount: {
                    include: {
                        neupIds: {
                            where: { isPrimary: true },
                        },
                    },
                },
            },
        });

        const seen = new Set<string>();
        const accounts = grants.map((grant) => {
            const ownerAccount = grant.parentAccount;
            if (!ownerAccount) return null;
            // Skip duplicate grants for the same owner account
            if (seen.has(ownerAccount.id)) return null;
            seen.add(ownerAccount.id);

            const neupId = ownerAccount.neupIds[0]?.id || 'unknown';
            const displayName = ownerAccount.displayName || 'Unnamed Account';

            const accessibleAccount: AccessibleAccount = {
                aid: ownerAccount.id,
                def: 0,
                sid: '',
                skey: '',
                neupId,
                active: false,
                isBrand: ownerAccount.accountType === 'brand',
                isDependent: ownerAccount.accountType === 'dependent',
                accountType: ownerAccount.accountType,
                displayName,
                displayPhoto: resolveDisplayImage({
                    displayImage: ownerAccount.displayImage,
                    accountType: ownerAccount.accountType,
                }),
            };
            return accessibleAccount;
        });

        return accounts.filter((acc): acc is AccessibleAccount => acc !== null);

    } catch (error) {
        await logError('database', error, 'getAccessibleAccounts');
        return [];
    }
}


/**
 * Function getUserStats.
 */
export async function getUserStats(): Promise<UserStats> {
    const canView = await checkPermissions(['root.dashboard.view']);
    if (!canView) return { totalUsers: 0, activeUsers: 0, signedUpToday: 0, permissionsDefined: 0 };

    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [totalUsers, signedUpToday, permissionsDefined] = await Promise.all([
            prisma.account.count(),
            prisma.account.count({
                where: { createdAt: { gte: twentyFourHoursAgo } },
            }),
            prisma.authzRole.count({
                where: {
                    appId: 'neup.account',
                    NOT: { id: { startsWith: 'account.custom.' } },
                },
            }),
        ]);
        const activeUsers = Math.floor(totalUsers * 0.8);
        return { totalUsers, activeUsers, signedUpToday, permissionsDefined };
    } catch (error) {
        await logError('database', error, 'getUserStats');
        return { totalUsers: 0, activeUsers: 0, signedUpToday: 0, permissionsDefined: 0 };
    }
}


/**
 * Function getAccessableAccountIds.
 *
 * Returns a deduplicated array of account IDs that the given accountId
 * has access to — i.e. all unique parent account IDs for active account grants.
 */
export async function getAccessableAccountIds(accountId: string): Promise<string[]> {
    try {
        await cleanupExpiredAccessModel();

        const grants = await prisma.access.findMany({
            where: {
                memberAccountId: accountId,
                parentAccountId: { not: null },
                status: 'active',
                OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
                role: {
                    appId: 'neup.account',
                },
            },
            select: { parentAccountId: true },
            distinct: ['parentAccountId'],
        });

        return grants
            .map((g) => g.parentAccountId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch (error) {
        await logError('database', error, `getAccessableAccountIds:${accountId}`);
        return [];
    }
}


/**
 * Type AccountsPage — paginated result from getAllAccountsPaginated.
 */
export type AccountsPage = {
    accounts: AccountBasics[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export type AccountFilterTab = 'all' | 'active' | 'guest' | 'brand' | 'individual';
export type AccountSortKey = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'last_active';

const SEARCHABLE_ACCOUNT_TYPES = new Set(['individual', 'brand', 'branch', 'dependent', 'guest', 'root']);
const ACTIVE_IN_UNITS_MS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

type ParsedAccountSearch = {
    text: string;
    accountType?: string;
    neupId?: string;
    roleName?: string;
    activeSince?: Date;
};

function parseAccountSearch(search: string): ParsedAccountSearch {
    const parsed: ParsedAccountSearch = { text: '' };
    const textParts: string[] = [];

    for (const rawPart of search.split('&')) {
        const part = rawPart.trim();
        if (!part) continue;

        const typeMatch = part.match(/^(?:type|accounttype|acctype|actype):(.+)$/i);
        if (typeMatch) {
            const accountType = typeMatch[1]?.trim().toLowerCase();
            if (accountType && SEARCHABLE_ACCOUNT_TYPES.has(accountType)) {
                parsed.accountType = accountType;
                continue;
            }
        }

        const neupIdMatch = part.match(/^neupid:(.+)$/i);
        if (neupIdMatch) {
            const neupId = neupIdMatch[1]?.trim();
            if (neupId) {
                parsed.neupId = neupId;
                continue;
            }
        }

        const roleMatch = part.match(/^role:(.+)$/i);
        if (roleMatch) {
            const roleName = roleMatch[1]?.trim();
            if (roleName) {
                parsed.roleName = roleName;
                continue;
            }
        }

        const activeInMatch = part.match(/^activein:(\d+)([mhdw])$/i);
        if (activeInMatch) {
            const amount = Number(activeInMatch[1]);
            const unit = activeInMatch[2].toLowerCase();
            if (amount > 0 && ACTIVE_IN_UNITS_MS[unit]) {
                parsed.activeSince = new Date(Date.now() - amount * ACTIVE_IN_UNITS_MS[unit]);
                continue;
            }
        }

        textParts.push(part);
    }

    parsed.text = textParts.join(' & ').trim();
    return parsed;
}

/**
 * Function getAllAccountsPaginated.
 *
 * Returns a paginated, filtered, and sorted slice of all accounts.
 * Requires root.account.view permission.
 */
export async function getAllAccountsPaginated(params: {
    page: number;
    pageSize?: number;
    search?: string;
    filter?: AccountFilterTab;
    sort?: AccountSortKey;
}): Promise<AccountsPage> {
    const canView = await checkPermissions(['root.account.view']);
    if (!canView) return { accounts: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

    const { page, pageSize = 10, search = '', filter = 'all', sort = 'newest' } = params;

    try {
        const parsedSearch = parseAccountSearch(search);

        // Build where clause
        const where: Prisma.AccountWhereInput = {};

        if (filter === 'active') {
            where.status = 'active';
        } else if (filter === 'guest') {
            where.accountType = 'guest';
        } else if (filter === 'brand') {
            where.accountType = { in: ['brand', 'branch'] };
        } else if (filter === 'individual') {
            where.accountType = 'individual';
        }

        if (parsedSearch.accountType === 'root') {
            where.accessMemberRows = {
                some: {
                    accessType: 'acc_self_root',
                    status: 'active',
                    OR: [
                        { isTemporary: null },
                        { isTemporary: { gt: new Date() } },
                    ],
                },
            };
        } else if (parsedSearch.accountType) {
            where.accountType = parsedSearch.accountType;
        }

        if (parsedSearch.roleName) {
            where.denormRoles = {
                some: {
                    OR: [
                        {
                            roleId: {
                                equals: parsedSearch.roleName,
                                mode: 'insensitive',
                            },
                        },
                        {
                            authzRole: {
                                id: {
                                    equals: parsedSearch.roleName,
                                    mode: 'insensitive',
                                },
                            },
                        },
                        {
                            authzRole: {
                                name: {
                                    equals: parsedSearch.roleName,
                                    mode: 'insensitive',
                                },
                            },
                        },
                    ],
                },
            };
        }

        if (parsedSearch.neupId) {
            where.neupIds = {
                some: {
                    neupId: {
                        contains: parsedSearch.neupId,
                        mode: 'insensitive',
                    },
                },
            };
        }

        if (parsedSearch.activeSince) {
            const activeAccounts = await prisma.activity.groupBy({
                by: ['memberId'],
                where: { timestamp: { gte: parsedSearch.activeSince } },
            });

            const activeAccountIds = activeAccounts.map((entry) => entry.memberId);
            if (activeAccountIds.length === 0) {
                return { accounts: [], total: 0, page, pageSize, totalPages: 0 };
            }

            where.id = { in: activeAccountIds };
        }

        if (parsedSearch.text) {
            where.OR = [
                { displayName: { contains: parsedSearch.text, mode: 'insensitive' } },
                { neupIds: { some: { neupId: { contains: parsedSearch.text, mode: 'insensitive' } } } },
                { id: { contains: parsedSearch.text, mode: 'insensitive' } },
            ];
        }

        // Build orderBy — last_active sorts by activity table, handled post-fetch
        const orderByMap: Record<Exclude<AccountSortKey, 'last_active'>, object> = {
            oldest:   { createdAt: 'asc' },
            name_asc: { displayName: 'asc' },
            name_desc:{ displayName: 'desc' },
            newest:   { createdAt: 'desc' },
        };
        const orderBy = sort !== 'last_active'
            ? (orderByMap[sort as Exclude<AccountSortKey, 'last_active'>] ?? { createdAt: 'desc' })
            : { createdAt: 'desc' }; // will re-sort after activity lookup

        const [total, rows] = await Promise.all([
            prisma.account.count({ where }),
            prisma.account.findMany({
                where,
                orderBy,
                skip: sort !== 'last_active' ? (page - 1) * pageSize : 0,
                take:  sort !== 'last_active' ? pageSize : undefined,
                select: {
                    id: true,
                    displayName: true,
                    displayImage: true,
                    status: true,
                    isVerified: true,
                    accountType: true,
                    neupIds: {
                        where: { isPrimary: true },
                        select: { neupId: true },
                        take: 1,
                    },
                },
            }),
        ]);

        // Fetch the most recent activity timestamp for each account in one query
        const accountIds = rows.map((r) => r.id);
        const latestActivities = accountIds.length > 0
            ? await prisma.activity.groupBy({
                by: ['memberId'],
                where: { memberId: { in: accountIds } },
                _max: { timestamp: true },
            })
            : [];

        const activityMap = new Map<string, Date | null>(
            latestActivities.map((a) => [a.memberId, a._max?.timestamp ?? null]),
        );

        let accounts = rows.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            displayImage: resolveDisplayImage({ displayImage: a.displayImage, accountType: a.accountType }),
            status: a.status,
            isVerified: a.isVerified,
            accountType: a.accountType,
            lastActivityAt: activityMap.get(a.id) ?? null,
            neupId: a.neupIds[0]?.neupId ?? null,
        }));

        // For last_active sort: sort by activity timestamp then paginate in memory
        if (sort === 'last_active') {
            accounts.sort((a, b) => {
                if (!a.lastActivityAt && !b.lastActivityAt) return 0;
                if (!a.lastActivityAt) return 1;
                if (!b.lastActivityAt) return -1;
                return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
            });
            accounts = accounts.slice((page - 1) * pageSize, page * pageSize);
        }

        return {
            accounts,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    } catch (error) {
        await logError('database', error, 'getAllAccountsPaginated');
        return { accounts: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    }
}


/**
 * Function getAllAccounts.
 *
 * Returns all accounts in the system regardless of type.
 * Requires root.account.view permission.
 */
export async function getAllAccounts(): Promise<AccountBasics[]> {
    const canView = await checkPermissions(['root.account.view']);
    if (!canView) return [];

    try {
        const accounts = await prisma.account.findMany({
            select: {
                id: true,
                displayName: true,
                displayImage: true,
                status: true,
                isVerified: true,
                accountType: true,
                neupIds: {
                    where: { isPrimary: true },
                    select: { neupId: true },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return accounts.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            displayImage: resolveDisplayImage({ displayImage: a.displayImage, accountType: a.accountType }),
            status: a.status,
            isVerified: a.isVerified,
            accountType: a.accountType,
            lastActivityAt: null,
            neupId: a.neupIds[0]?.neupId ?? null,
        }));
    } catch (error) {
        await logError('database', error, 'getAllAccounts');
        return [];
    }
}


/**
 * Function getAccessableAccounts.
 *
 * Calls getAccessableAccountIds, then fetches basic details for each unique
 * account via getAccountBasics. Returns AccountBasics[] — one entry per account,
 * deduplicated by id.
 */
export async function getAccessableAccounts(accountId: string): Promise<AccountBasics[]> {
    try {
        const ids = await getAccessableAccountIds(accountId);
        if (ids.length === 0) return [];

        const results = await Promise.all(ids.map((id) => getAccountBasics(id)));

        // Filter nulls and deduplicate by id
        const seen = new Set<string>();
        return results.filter((a): a is AccountBasics => {
            if (!a || seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });
    } catch (error) {
        await logError('database', error, `getAccessableAccounts:${accountId}`);
        return [];
    }
}


/**
 * Function getAccessableBrandAccounts.
 *
 * Calls getAccessableAccountIds, then filters to only accounts whose
 * accountType is 'brand' or 'branch'. Returns AccountBasics[] deduplicated by id.
 */
export async function getAccessableBrandAccounts(accountId: string): Promise<AccountBasics[]> {
    try {
        const ids = await getAccessableAccountIds(accountId);
        if (ids.length === 0) return [];

        const brandAccounts = await prisma.account.findMany({
            where: {
                id: { in: ids },
                accountType: { in: ['brand', 'branch'] },
            },
            select: {
                id: true,
                displayName: true,
                displayImage: true,
                status: true,
                isVerified: true,
                accountType: true,
                neupIds: {
                    where: { isPrimary: true },
                    select: { neupId: true },
                    take: 1,
                },
            },
        });

        const seen = new Set<string>();
        return brandAccounts
            .filter((a) => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            })
            .map((a) => ({
                id: a.id,
                displayName: a.displayName,
                displayImage: resolveDisplayImage({ displayImage: a.displayImage, accountType: a.accountType }),
                status: a.status,
                isVerified: a.isVerified,
                accountType: a.accountType,
                lastActivityAt: null,
                neupId: a.neupIds[0]?.neupId ?? null,
            }));
    } catch (error) {
        await logError('database', error, `getAccessableBrandAccounts:${accountId}`);
        return [];
    }
}


/**
 * Function getAccountBasics.
 *
 * Returns basic account information for a given accountId.
 */
export async function getAccountBasics(accountId: string): Promise<AccountBasics | null> {
    try {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                displayName: true,
                displayImage: true,
                status: true,
                isVerified: true,
                accountType: true,
                neupIds: {
                    where: { isPrimary: true },
                    select: { neupId: true },
                    take: 1,
                },
            },
        });

        if (!account) return null;

        return {
            id: account.id,
            displayName: account.displayName,
            displayImage: resolveDisplayImage({ displayImage: account.displayImage, accountType: account.accountType }),
            status: account.status,
            isVerified: account.isVerified,
            accountType: account.accountType,
            lastActivityAt: null,
            neupId: account.neupIds[0]?.neupId ?? null,
        };
    } catch (error) {
        await logError('database', error, `getAccountBasics:${accountId}`);
        return null;
    }
}


/**
 * Function getPermissionsForAccountPair.
 *
 * Returns the deduplicated list of permissions that `accessorId` holds
 * on `accessTo`, by joining member → role permission mappings.
 */
async function getPermissionsForAccountPair(
    accessorId: string,
    accessTo: string,
): Promise<string[]> {
    try {
        await cleanupExpiredAccessModel();

        const grants = await prisma.access.findMany({
            where: {
                memberAccountId: accessorId,
                parentAccountId: accessTo,
                status: 'active',
                OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
                role: {
                    appId: 'neup.account',
                },
            },
            select: {
                role: {
                    select: {
                        permissions: true,
                    },
                },
            },
        });

        const permissions = grants.flatMap((grant) => extractRolePermissionNames(grant.role.permissions));

        return Array.from(new Set(permissions));
    } catch (error) {
        await logError('database', error, `getPermissionsForAccountPair:${accessorId}:${accessTo}`);
        return [];
    }
}


/**
 * Function getAccessableAccountsWithPermissions.
 *
 * Like getAccessableAccounts, but each entry also includes the permissions
 * the caller holds on that specific account.
 */
export async function getAccessableAccountsWithPermissions(
    accountId: string,
): Promise<AccountBasicsWithPermissions[]> {
    try {
        const ids = await getAccessableAccountIds(accountId);
        if (ids.length === 0) return [];

        const [accountRows, allGrants] = await Promise.all([
            prisma.account.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    displayName: true,
                    displayImage: true,
                    status: true,
                    isVerified: true,
                    accountType: true,
                },
            }),
            // Fetch all grants for this accessor across all owner accounts in one query
            prisma.access.findMany({
                where: {
                    memberAccountId: accountId,
                    parentAccountId: { in: ids },
                    status: 'active',
                    OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
                    role: {
                        appId: 'neup.account',
                    },
                },
                select: {
                    parentAccountId: true,
                    role: {
                        select: {
                            permissions: true,
                        },
                    },
                },
            }),
        ]);

        // Build accessTo → permissions map
        const ownerCapMap = new Map<string, Set<string>>();
        for (const grant of allGrants) {
            if (!grant.parentAccountId) continue;
            if (!ownerCapMap.has(grant.parentAccountId)) {
                ownerCapMap.set(grant.parentAccountId, new Set());
            }
            for (const permission of extractRolePermissionNames(grant.role.permissions)) {
                ownerCapMap.get(grant.parentAccountId)!.add(permission);
            }
        }

        const seen = new Set<string>();
        return accountRows
            .filter((a) => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            })
            .map((a) => ({
                id: a.id,
                displayName: a.displayName,
                displayImage: resolveDisplayImage({ displayImage: a.displayImage, accountType: a.accountType }),
                status: a.status,
                isVerified: a.isVerified,
                accountType: a.accountType,
                lastActivityAt: null,
                neupId: null,
                permissions: Array.from(ownerCapMap.get(a.id) ?? []),
            }));
    } catch (error) {
        await logError('database', error, `getAccessableAccountsWithPermissions:${accountId}`);
        return [];
    }
}


/**
 * Function getAccessableBrandAccountsWithPermissions.
 *
 * Like getAccessableBrandAccounts, but each entry also includes the permissions
 * the caller holds on that specific brand/branch account.
 */
export async function getAccessableBrandAccountsWithPermissions(
    accountId: string,
): Promise<AccountBasicsWithPermissions[]> {
    try {
        const ids = await getAccessableAccountIds(accountId);
        if (ids.length === 0) return [];

        const [brandRows, allGrants] = await Promise.all([
            prisma.account.findMany({
                where: {
                    id: { in: ids },
                    accountType: { in: ['brand', 'branch'] },
                },
                select: {
                    id: true,
                    displayName: true,
                    displayImage: true,
                    status: true,
                    isVerified: true,
                    accountType: true,
                },
            }),
            prisma.access.findMany({
                where: {
                    memberAccountId: accountId,
                    parentAccountId: { in: ids },
                    status: 'active',
                    OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
                    role: {
                        appId: 'neup.account',
                    },
                },
                select: {
                    parentAccountId: true,
                    role: {
                        select: {
                            permissions: true,
                        },
                    },
                },
            }),
        ]);

        const brandIds = new Set(brandRows.map((b) => b.id));

        // Only keep grants for brand/branch accounts
        const relevantGrants = allGrants.filter(
            (g) => typeof g.parentAccountId === 'string' && brandIds.has(g.parentAccountId),
        );

        const ownerCapMap = new Map<string, Set<string>>();
        for (const grant of relevantGrants) {
            if (!grant.parentAccountId) continue;
            if (!ownerCapMap.has(grant.parentAccountId)) {
                ownerCapMap.set(grant.parentAccountId, new Set());
            }
            for (const permission of extractRolePermissionNames(grant.role.permissions)) {
                ownerCapMap.get(grant.parentAccountId)!.add(permission);
            }
        }

        const seen = new Set<string>();
        return brandRows
            .filter((a) => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            })
            .map((a) => ({
                id: a.id,
                displayName: a.displayName,
                displayImage: resolveDisplayImage({ displayImage: a.displayImage, accountType: a.accountType }),
                status: a.status,
                isVerified: a.isVerified,
                accountType: a.accountType,
                lastActivityAt: null,
                neupId: null,
                permissions: Array.from(ownerCapMap.get(a.id) ?? []),
            }));
    } catch (error) {
        await logError('database', error, `getAccessableBrandAccountsWithPermissions:${accountId}`);
        return [];
    }
}
