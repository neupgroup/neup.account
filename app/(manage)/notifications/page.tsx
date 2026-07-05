import { permission } from '@/neup.logica/permission';
import { getActiveAccountId } from '@/neup.core/auth/verify';
import { assertHasSelectedAccountAnyPermission, NOTIFICATION_PERMISSIONS } from '@/neup.core/auth/profile-permissions';
import { notFound } from 'next/navigation';
import NotificationsPageClient from './page.client';

const pagePermissions = [
    permission('notification.read.self', 'for_individual', 'page'),
    permission('notification.delete.self', 'for_individual', 'page'),
];

export default async function NotificationsPage() {
    const accountId = await getActiveAccountId();
    if (!accountId) {
        notFound();
    }

    await assertHasSelectedAccountAnyPermission(accountId, NOTIFICATION_PERMISSIONS);
    return <NotificationsPageClient />;
}
