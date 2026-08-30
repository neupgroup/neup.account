import { Card, CardContent } from '#/components/ui/card';
import { getNotifications } from '@/services/notifications';
import { ListItem } from '#/components/ui/list-item';
import { SecondaryHeader } from '#/components/ui/secondary-header';
import type { Notification as NotificationType } from '@/services/notifications';

function getNotificationDetails(notification: NotificationType): { iconName: string, message: string, href: string } {
    const defaultHref = '/notifications';
    let href = defaultHref;
    let message = notification.message || 'You have a new notification.';
    let iconName = 'MessageSquareWarning';

    switch (notification.action) {
        case 'informative.login':
        case 'informative.logout':
        case 'informative.unblock':
            href = '/security/devices';
            break;
        case 'informative.security':
            href = '/security';
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


export async function NotificationsCard() {
    const allNotifications = await getNotifications();

    const prioritizedNotifications = [
        ...allNotifications.sticky,
        ...allNotifications.requests,
        ...allNotifications.other
    ].filter(n => !n.isRead);
    
    const showAllButton = prioritizedNotifications.length >= 3;
    const notificationsToShow = showAllButton ? prioritizedNotifications.slice(0, 3) : prioritizedNotifications;

    if (prioritizedNotifications.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <SecondaryHeader 
                title="Account Updates"
                description="Your most recent and important alerts."
            />
            <Card>
                <CardContent className="divide-y p-0">
                    {notificationsToShow.map(notification => {
                        const { iconName, message, href } = getNotificationDetails(notification as NotificationType);
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
                     {showAllButton && (
                        <ListItem
                            href="/notifications"
                            iconName="Bell"
                            title="See all notifications"
                            description={`You have ${prioritizedNotifications.length} total unread notifications.`}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
