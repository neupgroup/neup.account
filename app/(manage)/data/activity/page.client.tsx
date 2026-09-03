"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    Card,
    CardContent,
} from "#/components/ui/card"
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge"
import { getActivities } from "@/services/log-actions"
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { BackButton } from "#/components/element/backButton";
import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { redirectInApp } from "@/.neup/core/helpers/link/navigation";
import type { ActivityLog } from "@/services/log-actions";
import { applicationHref } from "@/app/(manage)/application/_lib/query-param";

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

function DataActivityPageComponent({ after, applicationId, history }: { after?: string; applicationId?: string; history: string[] }) {
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [hasNextPage, setHasNextPage] = useState(false);

    const router = useRouter();

    const buildUrl = (startAfter?: string, nextHistory: string[] = []) => {
        const params = new URLSearchParams();
        if (applicationId) params.set('application', applicationId);
        if (startAfter) params.set('after', startAfter);
        for (const item of nextHistory) {
            params.append('h', item);
        }
        const qs = params.toString();
        return `/data/activity${qs ? `?${qs}` : ''}`;
    };

    const fetchData = useCallback(async (startAfter?: string) => {
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
    
    const handleNextPage = () => {
        if (logs.length > 0) {
            const lastId = logs[logs.length - 1].id;
            const newHistory = [...history, after ?? ""];
            redirectInApp(router, buildUrl(lastId, newHistory));
        }
    };

    const handlePrevPage = () => {
        if (history.length === 0) return;
        const prevAfterId = history[history.length - 1] || undefined;
        const newHistory = history.slice(0, -1);
        redirectInApp(router, buildUrl(prevAfterId, newHistory));
    };

    const backHref = applicationId ? applicationHref('/application', applicationId) : '/data';

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
                    <Card>
                        <CardContent className="divide-y p-0">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="p-4 animate-pulse">
                                    <Skeleton className="h-4 w-3/5" />
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <Skeleton className="h-6 w-24 rounded-full" />
                                        <Skeleton className="h-4 w-36" />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ) : logs.length > 0 ? (
                    <Card>
                        <CardContent className="divide-y p-0">
                            {logs.map((log) => (
                                <div key={log.id} className="p-4 transition-colors hover:bg-muted/20">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                            <p className="font-medium text-foreground leading-relaxed">
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
                                                <div className="text-sm text-muted-foreground">
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
                                    <p className="mt-2 text-sm text-muted-foreground">{formatActivityTimestamp(log.timestamp)}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                        No activity found.
                    </div>
                )}
            </div>
            <div className="flex justify-start space-x-2 pt-2">
                 <Button variant="outlined" onClick={handlePrevPage} disabled={history.length === 0 || loading}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Previous
                </Button>
                <Button variant="outlined" onClick={handleNextPage} disabled={!hasNextPage || loading}>
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
    const history = searchParams.getAll('h');
    return <DataActivityPageComponent after={after} applicationId={applicationId} history={history} />;
}
