import type { Metadata } from 'next';
import { checkPermissions, getAccountType } from '@/services/user';
import { notFound } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { BillingCard } from '@/components/dashboard/billing-card';
import { SettingsCard } from '@/components/dashboard/settings-card';
import { WarningDisplay } from '@/components/warning-display';
import { getActiveAccountId } from '@/core/auth/verify';
import { NotificationsCard } from '@/components/dashboard/notifications-card';
import { ManageStatsCard } from '@/components/dashboard/manage-stats-card';
import { FindUserCard } from '@/components/dashboard/find-user-card';
import { SystemToolsCard } from '@/components/dashboard/system-tools-card';
import { createPageMetadata } from '@/core/metadata';
import { permission } from '@/neup.logica/permission';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = createPageMetadata('Homepage');

const pagePermissions = [
  permission('notification.read', 'for_individual', 'page'),
  permission('payment.subscriptions.show', 'for_individual', 'page'),
  permission('root.account.view', 'for_individual', 'page'),
];

export default async function HomePage() {
    const accountId = await getActiveAccountId();

    if (!accountId) {
      notFound();
    }

    const accountType = await getAccountType(accountId);

    const showPersonalSettings = accountType === 'individual';

    const [canViewNotifications, canViewBilling, canFindUser] = await Promise.all([
        checkPermissions(['notification.read']),
        checkPermissions(['payment.subscriptions.show']),
        checkPermissions(['root.account.view']),
    ]);
    
    return (
        <div className="grid gap-8">
            <WarningDisplay />
            <DashboardHeader />
            {canViewNotifications && <NotificationsCard />}
            {showPersonalSettings && <SettingsCard />}
            {canViewBilling && <BillingCard />}
            <ManageStatsCard />
            {canFindUser && <FindUserCard />}
            <SystemToolsCard />
        </div>
    )
}
