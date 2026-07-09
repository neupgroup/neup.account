
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"
import { getActivities, ActivityLog } from "@/services/log-actions"
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectInApp } from "@/core/helpers/navigation";


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

function SecurityActivityPageComponent({ after }: { after?: string }) {
    const [contentLoading, setContentLoading] = useState(true);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [page, setPage] = useState(1);
    const [pageHistory, setPageHistory] = useState<(string | undefined)[]>([undefined]); // History of 'after' IDs
    const [hasNextPage, setHasNextPage] = useState(false);
    
    const router = useRouter();

    const fetchData = useCallback(async (startAfter?: string) => {
        setContentLoading(true);
        const { logs, hasNextPage: newHasNextPage } = await getActivities({ startAfter, forCurrentUser: true });
        setLogs(logs);
        setHasNextPage(newHasNextPage);
        setContentLoading(false);
    }, []);
    
    useEffect(() => {
        fetchData(after);
    }, [after, fetchData]);
    
    const handleNextPage = () => {
        if (logs.length > 0) {
            const lastId = logs[logs.length - 1].id;
            const newHistory = [...pageHistory, lastId];
            setPageHistory(newHistory);
            setPage(p => p + 1);
            redirectInApp(router, `/manage/security/activity?after=${lastId}`);
        }
    };

    const handlePrevPage = () => {
        const prevPageHistory = pageHistory.slice(0, -1);
        const prevAfterId = prevPageHistory[prevPageHistory.length - 1];
        setPageHistory(prevPageHistory);
        setPage(p => p - 1);
        const url = prevAfterId ? `/manage/security/activity?after=${prevAfterId}` : '/manage/security/activity';
        redirectInApp(router, url);
    };

    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <Card>
                <CardHeader>
                    <CardTitle>Recent Account Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Timestamp</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {contentLoading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell>
                                    </TableRow>
                                ))
                             ) : logs.length > 0 ? (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>{log.actionText}</TableCell>
                                        <TableCell>
                                            {(() => {
                                                const pill = getStatusPill(log);
                                                if (!pill) return null;
                                                return (
                                                    <Badge variant={pill.variant} className={pill.className}>
                                                        {pill.label}
                                                    </Badge>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell>{log.timestamp}</TableCell>
                                    </TableRow>
                                ))
                             ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center h-24">
                                        No successful activities found.
                                    </TableCell>
                                </TableRow>
                             )}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2 border-t pt-4">
                     <Button variant="outline" onClick={handlePrevPage} disabled={page === 1 || contentLoading}>
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                    </Button>
                    <Button variant="outline" onClick={handleNextPage} disabled={!hasNextPage || contentLoading}>
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

export default function SecurityActivityPage() {
    const searchParams = useSearchParams();
    const after = searchParams.get('after') || undefined;
    return <SecurityActivityPageComponent after={after} />;
}
