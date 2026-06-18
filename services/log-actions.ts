'use server';

// Handles writing and reading activity logs from the database.
// Activity logs record user actions (e.g. login, profile update) with status and IP.

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { getActiveAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { compileActivityAction } from '@/services/activity-action';

// Number of activity logs returned per page
const PAGE_SIZE = 10;

export type ActivityLog = {
    id: string;
    user: string;
    neupId: string;
    actionText: string;
    actionDetails?: string[];
    actionRender?: {
        kind: 'profile_display_image_changed';
        oldImageUrl: string;
        newImageUrl: string;
    };
    status: string;
    timestamp: string;
};

function unquote(value: string) {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return trimmed;
}

function getProfileImageActionRender(action: string) {
    const match = action.match(/^profile\.displayImage\.changedFrom\((.+)\)\.changedTo\((.+)\)$/);
    if (!match) return null;
    return {
        kind: 'profile_display_image_changed' as const,
        oldImageUrl: unquote(match[1]),
        newImageUrl: unquote(match[2]),
    };
}

// Writes a single activity entry to the database.
// If actorAccountId is not provided, the target account is assumed to be the actor.
// IP is read from the request headers if not explicitly passed.
export async function logActivity(
    memberId: string,
    action: string,
    status: "Success" | "Failed" | "Pending" | "Alert",
    ipAddress?: string,
    actorAccountId?: string,
    geolocation?: string,
) {
    try {
        const ip = ipAddress || 'Unknown IP';
        
        const finalActorAccountId = actorAccountId || memberId;

        await prisma.activity.create({
            data: {
                memberId,
                actorAccountId: finalActorAccountId,
                action,
                status,
                ip,
                timestamp: new Date(),
                geolocation,
            }
        });

    } catch (error) {
        await logError('database', error, 'logActivity:create');
    }
}

type GetActivitiesParams = {
  startAfter?: string;
  forCurrentUser?: boolean;
  /** When set, only returns activity logs where memberId equals this value (e.g. an appId). */
  targetId?: string;
};

type GetActivitiesResponse = {
  logs: ActivityLog[];
  hasNextPage: boolean;
};

// Fetches a paginated list of activity logs, ordered by most recent first.
// If forCurrentUser is true, only logs where the actor is the current account are returned.
// If targetId is set, only logs where memberId equals that value are returned (e.g. app-scoped logs).
// Uses cursor-based pagination via startAfter (the ID of the last seen log).
export async function getActivities({ startAfter: startAfterDocId, forCurrentUser = false, targetId }: GetActivitiesParams): Promise<GetActivitiesResponse> {
    try {
        const currentAccountId = await getActiveAccountId();
        const isRootUser = await checkPermissions(['requests.root_approval.view']);
        
        const where: any = {};
        if (targetId) {
            where.memberId = targetId;
        } else if (forCurrentUser) {
            if (!currentAccountId) {
                 return { logs: [], hasNextPage: false };
            }
            where.actorAccountId = currentAccountId;
        }

        const queryOptions: any = {
            where,
            orderBy: { timestamp: 'desc' },
            // Fetch one extra to determine if there is a next page
            take: PAGE_SIZE + 1,
        };

        if (startAfterDocId) {
            queryOptions.cursor = { id: startAfterDocId };
            queryOptions.skip = 1;
        }

        const pageDocs = await prisma.activity.findMany(queryOptions);

        let hasNextPage = pageDocs.length > PAGE_SIZE;
        if (hasNextPage) {
            pageDocs.pop();
        }

        if (pageDocs.length === 0) {
            return { logs: [], hasNextPage: false };
        }

        // Collect unique actor IDs and batch-fetch profiles and NeupIDs in 2 queries
        const uniqueActorIds = Array.from(new Set(pageDocs.map(doc => doc.actorAccountId)));

        const [accounts, neupIdRows] = await Promise.all([
            prisma.account.findMany({
                where: { id: { in: uniqueActorIds } },
                select: {
                    id: true,
                    displayName: true,
                    individualProfile: { select: { firstName: true, lastName: true } },
                    brandProfile: { select: { brandName: true } },
                },
            }),
            prisma.neupId.findMany({
                where: { accountId: { in: uniqueActorIds }, isPrimary: true },
                select: { accountId: true, id: true },
            }),
        ]);

        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const neupIdMap = new Map(neupIdRows.map(n => [n.accountId, n.id]));

        const getDisplayName = (accountId: string): string => {
            const a = accountMap.get(accountId);
            if (!a) return accountId;
            return a.brandProfile?.brandName
                || a.displayName
                || `${a.individualProfile?.firstName || ''} ${a.individualProfile?.lastName || ''}`.trim()
                || accountId;
        };

        const logs: ActivityLog[] = pageDocs.map(doc => ({
            ...(() => {
                const compiled = compileActivityAction(doc.action);
                const profileImageActionRender = isRootUser ? getProfileImageActionRender(doc.action) : null;
                return {
                    actionText: compiled.title,
                    actionDetails: compiled.details,
                    actionRender: profileImageActionRender || undefined,
                };
            })(),
            id: doc.id,
            user: getDisplayName(doc.actorAccountId),
            neupId: neupIdMap.get(doc.actorAccountId) || 'N/A',
            status: doc.status,
            timestamp: doc.timestamp.toLocaleString(),
        }));
        
        return { logs, hasNextPage };

    } catch (error) {
        await logError('database', error, 'getActivities');
        return { logs: [], hasNextPage: false };
    }
}
