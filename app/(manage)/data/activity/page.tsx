"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    Card,
    CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"
import { getActivities } from "@/services/log-actions"
import { ChevronLeft, ChevronRight, Ban } from "@/components/icons";
import { BackButton } from "@/components/ui/back-button";
import { checkPermissions } from '@/services/user';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectInApp } from "@/services/navigation";
import type { ActivityLog } from "@/services/log-actions";

const statusVariantMap: { [key: string]: "default" | "destructive" | "secondary" } = {
    Success: "default",
    Failed: "destructive",
    Pending: "secondary",
    Alert: "destructive",
}

function getStatusPill(log: ActivityLog): { label: string; variant: "default" | "destructive" | "secondary"; className?: string } | null {
    if (log.status === "Success") return null;
    if (log.status === "Pending") return { label: "Pending", variant: "secondary" };

    const text = `${log.actionText} ${log.actionDetails?.join(" ") || ""}`.toLowerCase();
    if (text.includes("cancel")) return { label: "Cancelled", variant: "destructive" };
    if (text.includes("terminat")) return { label: "Terminated", variant: "destructive" };
    if (text.includes("deactivat")) return { label: "Deactivated", variant: "destructive" };
    if (text.includes("reject") || text.includes("denied")) return { label: "Rejected", variant: "destructive" };

    return { label: log.status, variant: statusVariantMap[log.status] || "secondary" };
}

const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getOrdinal(day: number) {
    const mod10 = day % 10;
    const mod100 = day % 100;
    if (mod10 === 1 && mod100 !== 11) return `${day}st`;
    if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
    if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
    return `${day}th`;
}

function startOfWeekMonday(date: Date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() + diff);
    return copy;
}

function formatActivityTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
        return `${getOrdinal(date.getDate())} ${MONTHS_FULL[date.getMonth()]}`;
    }
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes <= 0) return "Recently";
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;

    const thisWeekStart = startOfWeekMonday(now).getTime();
    const nextWeekStart = thisWeekStart + 7 * 24 * 60 * 60 * 1000;
    const isSameWeek = date.getTime() >= thisWeekStart && date.getTime() < nextWeekStart;

    if (isSameWeek && diffMs >= 0) {
        const weekday = WEEKDAYS[date.getDay()];
        const time = new Intl.DateTimeFormat("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        }).format(date);
        return `${weekday} ${time}`;
    }

    const monthsDiff =
        (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());

    if (monthsDiff < 12) {
        const safeMonths = Math.max(1, monthsDiff);
        return `${safeMonths} month${safeMonths === 1 ? "" : "s"} ago`;
    }

    return `On ${date.getFullYear()} ${MONTHS_FULL[date.getMonth()]} ${date.getDate()}`;
}

function DataActivityPageComponent({ after, applicationId }: { after?: string; applicationId?: string }) {
    const [canView, setCanView] = useState(false);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [page, setPage] = useState(1);
    const [pageHistory, setPageHistory] = useState<(string | undefined)[]>([undefined]);
    const [hasNextPage, setHasNextPage] = useState(false);

    const router = useRouter();

    const buildUrl = (startAfter?: string) => {
        const params = new URLSearchParams();
        if (applicationId) params.set('application', applicationId);
        if (startAfter) params.set('after', startAfter);
        const qs = params.toString();
        return `/data/activity${qs ? `?${qs}` : ''}`;
    };

    const fetchData = useCallback(async (startAfter?: string) => {
        const hasPerm = await checkPermissions(['security.recent_activities.view']);
        setCanView(hasPerm);
        if (!hasPerm) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const { logs, hasNextPage: newHasNextPage } = await getActivities({
            startAfter,
            targetId: applicationId,
        });
        setLogs(logs as any[]);
        setHasNextPage(newHasNextPage);
        setLoading(false);
    }, [applicationId]);

    useEffect(() => {
        fetchData(after);
    }, [after, fetchData]);
    
    if (!canView && !loading) {
        return (
            <div className="space-y-4">
                <BackButton href="/data" />
                <Alert variant="destructive">
                    <Ban className="h-4 w-4" />
                    <AlertTitle>Permission Denied</AlertTitle>
                    <AlertDescription>
                        You do not have permission to view recent activity.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }
    
    const handleNextPage = () => {
        if (logs.length > 0) {
            const lastId = logs[logs.length - 1].id;
            const newHistory = [...pageHistory, lastId];
            setPageHistory(newHistory);
            setPage(p => p + 1);
            redirectInApp(router, buildUrl(lastId));
        }
    };

    const handlePrevPage = () => {
        const prevPageHistory = pageHistory.slice(0, -1);
        const prevAfterId = prevPageHistory[prevPageHistory.length - 1];
        setPageHistory(prevPageHistory);
        setPage(p => p - 1);
        redirectInApp(router, buildUrl(prevAfterId));
    };

    const backHref = applicationId ? `/application/${applicationId}` : '/data';

    return (
        <div className="grid gap-8">
            <div>
                <BackButton href={backHref} />
                <h1 className="text-3xl font-bold tracking-tight mt-4">
                    {applicationId ? 'Application Activity' : 'Your Account Activity'}
                </h1>
                <p className="text-muted-foreground">
                    {applicationId
                        ? 'Activity log for this application — changes, requests, and status events.'
                        : 'View a log of recent actions performed on your account.'}
                </p>
            </div>
            <div className="space-y-0">
                {loading ? (
                    [...Array(5)].map((_, i) => (
                        <Card key={i} className="border-dashed">
                            <CardContent className="p-4 space-y-3">
                                <Skeleton className="h-4 w-3/5" />
                                <div className="flex items-center justify-between gap-3">
                                    <Skeleton className="h-6 w-24 rounded-full" />
                                    <Skeleton className="h-4 w-36" />
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : logs.length > 0 ? (
                    logs.map((log, index) => (
                        <Card
                            key={log.id}
                            className={`transition-colors hover:bg-muted/20 ${
                                index === 0
                                    ? "rounded-t-3xl rounded-b-none"
                                    : index === logs.length - 1
                                        ? "rounded-t-none rounded-b-3xl -mt-px"
                                        : "rounded-none -mt-px"
                            }`}
                        >
                            <CardContent className="p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-relaxed">
                                            {log.actionRender?.kind === 'profile_display_image_changed' ? (
                                                <>
                                                    You{" "}
                                                    <a
                                                        href={log.actionRender.oldImageUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="no-underline hover:underline underline-offset-4"
                                                    >
                                                        changed
                                                    </a>{" "}
                                                    your{" "}
                                                    <a
                                                        href={log.actionRender.newImageUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="no-underline hover:underline underline-offset-4"
                                                    >
                                                        profile picture
                                                    </a>
                                                    .
                                                </>
                                            ) : (
                                                log.actionText
                                            )}
                                        </p>
                                        {log.actionDetails?.length ? (
                                            <div className="text-xs text-muted-foreground space-y-0.5">
                                                {log.actionDetails.map((detail) => (
                                                    <p key={detail}>{detail}</p>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                    {(() => {
                                        const pill = getStatusPill(log);
                                        if (!pill) return null;
                                        return (
                                            <Badge variant={pill.variant} className={pill.className}>
                                                {pill.label}
                                            </Badge>
                                        );
                                    })()}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{formatActivityTimestamp(log.timestamp)}</p>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                        No activity found.
                    </div>
                )}
            </div>
            <div className="flex justify-end space-x-2 pt-4">
                 <Button variant="outline" onClick={handlePrevPage} disabled={page === 1 || loading}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Previous
                </Button>
                <Button variant="outline" onClick={handleNextPage} disabled={!hasNextPage || loading}>
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

export default function DataActivityPage() {
    const searchParams = useSearchParams();
    const after = searchParams.get('after') || undefined;
    const applicationId = searchParams.get('application') || undefined;
    return <DataActivityPageComponent after={after} applicationId={applicationId} />;
}
