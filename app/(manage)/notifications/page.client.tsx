"use client";

import { useState, useEffect } from 'react';
import { getNotifications } from '@/services/notifications';
import type { AllNotifications } from '@/services/notifications';
import { NotificationManager } from '@/app/(manage)/notifications/notification-manager';
import { Skeleton } from '@neup/components/ui/skeleton';

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<AllNotifications | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            const fetchedNotifications = await getNotifications();
            setNotifications(fetchedNotifications as AllNotifications);
            setLoading(false);
        };

        fetchNotifications();
    }, []);

    if (loading || !notifications) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-bold tracking-tight text-2xl leading-8">Notifications</h1>
                <p className="text-muted-foreground text-sm leading-6">
                    Manage your account notifications and alerts.
                </p>
            </div>
            <NotificationManager initialNotifications={notifications} />
        </div>
    );
}
