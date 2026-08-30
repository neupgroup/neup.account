'use client';

import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BackButton } from "@/components/ui/back-button";
import { ActivityList } from "./activity-list";
import { getAccountBasics, type AccountBasics } from "@/services/manage/accounts";

export default function UserActivityPage() {
    const params = useParams<{ id: string }>();
    const [account, setAccount] = useState<AccountBasics | null>(null);
    const [, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            const result = await getAccountBasics(params.id);
            setAccount(result);
        });
    }, [params.id]);

    const isGuest = account?.accountType === 'guest';

    const description = !account
        ? null
        : isGuest
        ? `Recent activities on Guest Account (${params.id})`
        : `Recent activity on Account of ${account.displayName ?? 'Unnamed Account'}${account.neupId ? ` (@${account.neupId})` : ''}`;

    return (
         <div className="grid gap-8">
            <BackButton href={`/manage/${params.id}`} />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Account Activity</h1>
                <p className="text-muted-foreground">
                    {description ?? `Recent activity log for account ID: ${params.id}.`}
                </p>
            </div>
            <ActivityList accountId={params.id} />
        </div>
    )
}
