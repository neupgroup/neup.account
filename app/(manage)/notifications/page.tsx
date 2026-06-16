import { getActiveAccountId } from '@/core/auth/verify';
import { assertHasSelectedAccountAnyPermission, NOTIFICATION_PERMISSIONS } from '@/core/auth/profile-permissions';
import { notFound } from 'next/navigation';
import NotificationsPageClient from './page.client';

export default async function NotificationsPage() {
    const accountId = await getActiveAccountId();
    if (!accountId) {
        notFound();
    }

    await assertHasSelectedAccountAnyPermission(accountId, NOTIFICATION_PERMISSIONS);
    return <NotificationsPageClient />;
}
