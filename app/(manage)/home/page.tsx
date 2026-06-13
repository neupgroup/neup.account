
import { checkPermissions } from '@/services/user';
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

export const dynamic = 'force-dynamic';

export default async function HomePage() {
    const accountId = await getActiveAccountId();
    if (!accountId) {
      notFound();
    }

    const [canViewNotifications, canViewBilling, canFindUser] = await Promise.all([
        checkPermissions(['self.notification.read']),
        checkPermissions(['payment.subscriptions.show']),
        checkPermissions(['root.account.view']),
    ]);
    
    return (
        <div className="grid gap-8">
            <WarningDisplay />
            <DashboardHeader />
            {canViewNotifications && <NotificationsCard />}
            <SettingsCard />
            {canViewBilling && <BillingCard />}
            <ManageStatsCard />
            {canFindUser && <FindUserCard />}
            <SystemToolsCard />
        </div>
    )
}
