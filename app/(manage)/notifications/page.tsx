import { permission } from '@/logica/permission';
import { getActiveAccountId } from '@/logica/account/verify';
import { assertHasSelectedAccountAnyPermission, NOTIFICATION_PERMISSIONS } from '@/logica/account/profile-permissions';
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
