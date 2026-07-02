'use client';

import { getActivity } from "@/services/manage/users";
import { getAccountBasics } from "@/services/manage/accounts";
import { checkPermissions } from '@/services/user';
import { Ban, MapPin } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import type { UserActivityLog } from '@/services/manage/users';
import type { AccountBasics } from '@/services/manage/accounts';
import { permission } from '@/logica/permission';

const componentPermissions = [
    permission('root.account.view', 'for_individual', 'component'),
];

// ── Time formatting ──────────────────────────────────────────────────────────

function formatRelative(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60)  return 'just now';
    if (diffMin < 60)  return `${diffMin} min${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr  < 24)  return `${diffHr} hr${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay < 7)   return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? 's' : ''} ago`;
}

function formatAbsolute(date: Date): string {
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    const sameDay  =
        sameYear &&
        date.getMonth()  === now.getMonth() &&
        date.getDate()   === now.getDate();

    if (sameDay) {
        // Just time
        return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    if (sameYear) {
        // Month day and time
        return date.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    }
    // Different year — full date + time
    return date.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ── Single row ───────────────────────────────────────────────────────────────

function ActivityRow({
    log,
    account,
    isFirst,
    isLast,
}: {
    log: UserActivityLog;
    account: AccountBasics | null;
    isFirst: boolean;
    isLast: boolean;
}) {
    const [hovered, setHovered] = useState(false);
    const ts = log.rawTimestamp instanceof Date ? log.rawTimestamp : new Date(log.rawTimestamp);

    const initials = account?.displayName
        ? account.displayName.charAt(0).toUpperCase()
        : '?';

    const displayName = account?.displayName ?? 'Unknown';

    const roundingClass =
        isFirst && isLast ? 'rounded-lg'
        : isFirst          ? 'rounded-t-lg'
        : isLast           ? 'rounded-b-lg'
        : '';

    return (
        <div
            className={`
                flex items-start gap-4 px-4 py-3.5
                border border-border bg-card
                ${roundingClass}
                ${!isFirst ? '-mt-px' : ''}
            `}
        >
            {/* Avatar initial */}
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground select-none mt-0.5">
                {initials}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                    <span className="font-medium">{displayName}</span>
                    {' '}performed{' '}
                    <span className="font-medium text-foreground">"{log.action}"</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    from IP <span className="font-mono">{log.ip}</span>
                    {log.geolocation && (
                        <> and from location <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3 shrink-0" />{log.geolocation}</span></>
                    )}
                </p>
            </div>

            {/* Timestamp */}
            <div
                className="shrink-0 text-xs text-muted-foreground cursor-default select-none pt-0.5 text-right"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                title={formatAbsolute(ts)}
            >
                {hovered ? formatAbsolute(ts) : formatRelative(ts)}
            </div>
        </div>
    );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ActivitySkeleton() {
    return (
        <div>
            {Array.from({ length: 6 }, (_, i) => (
                <div
                    key={i}
                    className={`
                        flex items-start gap-4 px-4 py-3.5 border border-border bg-card
                        ${i === 0 ? 'rounded-t-lg' : ''}
                        ${i === 5 ? 'rounded-b-lg' : ''}
                        ${i > 0 ? '-mt-px' : ''}
                    `}
                >
                    <Skeleton className="h-8 w-8 rounded-md shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-3 w-16 mt-0.5" />
                </div>
            ))}
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ActivityList({
    initialActivity,
    accountId,
}: {
    initialActivity?: UserActivityLog[];
    accountId: string;
}) {
    const [canView, setCanView]   = useState(false);
    const [loading, setLoading]   = useState(!initialActivity);
    const [logs, setLogs]         = useState<UserActivityLog[]>(initialActivity ?? []);
    const [account, setAccount]   = useState<AccountBasics | null>(null);

    useEffect(() => {
        const load = async () => {
            const hasPerm = await checkPermissions(['root.account.view']);
            setCanView(hasPerm);
            if (!hasPerm) { setLoading(false); return; }

            const [fetchedLogs, fetchedAccount] = await Promise.all([
                initialActivity ? Promise.resolve(initialActivity) : getActivity(accountId),
                getAccountBasics(accountId),
            ]);
            setLogs(fetchedLogs);
            setAccount(fetchedAccount);
            setLoading(false);
        };
        load();
    }, [accountId, initialActivity]);

    if (loading) return <ActivitySkeleton />;

    if (!canView) {
        return (
            <Alert variant="destructive">
                <Ban className="h-4 w-4" />
                <AlertTitle>Permission Denied</AlertTitle>
                <AlertDescription>
                    You do not have permission to view this activity log.
                </AlertDescription>
            </Alert>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground text-sm">
                No activity recorded for this account.
            </div>
        );
    }

    return (
        <div>
            {logs.map((log, i) => (
                <ActivityRow
                    key={log.id}
                    log={log}
                    account={account}
                    isFirst={i === 0}
                    isLast={i === logs.length - 1}
                />
            ))}
        </div>
    );
}
