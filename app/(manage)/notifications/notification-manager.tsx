

'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/neup.core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X, Bell, type LucideIcon, Handshake, UserPlus, MessageSquareWarning } from '@/components/icons';
import type { AllNotifications, Notification } from '@/services/notifications';
import { Card, CardContent } from '@/components/ui/card';
import { markNotificationAsRead, deleteNotification } from '@/services/notifications';
import { cn } from '@/neup.core/helpers/utils';
import { cva } from 'class-variance-authority';
import { ListItem } from '@/components/ui/list-item';

const warningVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      noticeType: {
        general: "bg-blue-50 border-blue-200 text-blue-800 [&>svg]:text-blue-500",
        success: "bg-green-50 border-green-200 text-green-800 [&>svg]:text-green-500",
        warning: "bg-orange-50 border-orange-200 text-orange-800 [&>svg]:text-orange-500",
        error: "bg-destructive/10 border-destructive/20 text-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      noticeType: "general",
    },
  }
)

function getNotificationDetails(notification: Notification): { iconName: string; message: string; href: string } {
    const defaultHref = '/manage/notifications';
    let href = defaultHref;
    let message = notification.message || 'You have a new notification.';
    let iconName = 'MessageSquareWarning';

    switch (notification.action) {
        case 'informative.login':
        case 'informative.logout':
        case 'informative.unblock':
            href = '/manage/security/devices';
            break;
        case 'informative.security':
            href = '/manage/security';
            break;
        case 'informative.profile.display_name_changed':
        case 'informative.profile.display_image_changed':
            iconName = 'UserCircle';
            href = '/profile/display';
            break;
        case 'access_invitation':
            iconName = 'Handshake';
            message = `${notification.senderName} wants you to manage their account.`;
            href = '/access/invitations';
            break;
        case 'family_invitation':
            iconName = 'UserPlus';
            message = `${notification.senderName} invited you to join their family.`;
            href = '/access/invitations';
            break;
    }
    
    if (notification.action?.includes('sticky')) {
        iconName = 'AlertTriangle';
        message = notification.message || 'An important notice was posted.';
    }

    return { iconName, message, href };
}


const formatDate = (isoString: string) => {
    const notificationDate = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - notificationDate.getTime()) / 1000);

    if (seconds < 60) return "just now";
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;

    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
};


export function NotificationManager({ initialNotifications }: { initialNotifications: AllNotifications }) {
    const [notifications, setNotifications] = useState(initialNotifications);
    
    const allNotifications = [
        ...notifications.sticky,
        ...notifications.requests,
        ...notifications.other
    ];

    if (allNotifications.length === 0) {
        return (
             <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                    <Bell className="mx-auto h-12 w-12 mb-4" />
                    <h3 className="text-lg font-semibold">All caught up!</h3>
                    <p>You have no new notifications.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardContent className="divide-y p-0">
                {allNotifications.map(notification => {
                    const { iconName, message, href } = getNotificationDetails(notification);
                    return (
                        <ListItem
                            key={notification.id}
                            href={href}
                            iconName={iconName}
                            title={message}
                            description={formatDate(notification.createdAt)}
                        />
                    )
                })}
            </CardContent>
        </Card>
    );
}
