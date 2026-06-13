import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { NOTIFICATION_PERMISSIONS } from '@/core/auth/profile-permissions';
import NotificationsPageClient from './page.client';

export default async function NotificationsPage() {
    await requireAnyPermission404(NOTIFICATION_PERMISSIONS);
    return <NotificationsPageClient />;
}
