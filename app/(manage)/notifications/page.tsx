import { permission } from '@/logica/permission';
import { getActiveAccountId } from '@/services/account/verify';
import { NOTIFICATION_PERMISSIONS } from '@/core/account/profile-permissions';
import { assertHasSelectedAccountAnyPermission } from '@/services/account/profile-permissions';
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
