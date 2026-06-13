"use client";

import { useState, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { getNotifications, markNotificationAsRead, deleteNotification } from '@/services/notifications';
import type { Notification, AllNotifications } from '@/services/notifications';
import { NotificationManager } from '@/app/(manage)/notifications/notification-manager';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/core/providers/session';
import { hasAnyPermission, NOTIFICATION_PERMISSIONS } from '@/core/auth/profile-permissions';

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<AllNotifications | null>(null);
    const [loading, setLoading] = useState(true);
    const { permissions, loading: sessionLoading } = useSession();

    if (!sessionLoading && !hasAnyPermission(permissions, NOTIFICATION_PERMISSIONS)) {
        notFound();
    }

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
                <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
                <p className="text-muted-foreground">
                    Manage your account notifications and alerts.
                </p>
            </div>
            <NotificationManager initialNotifications={notifications} />
        </div>
    );
}
