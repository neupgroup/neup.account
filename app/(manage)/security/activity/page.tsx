import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/inapp/permissions/security-permissions';
import SecurityActivityPageClient from './page.client';

const pagePermissions = [
    permission('security.recent_activities.view.self', 'for_individual', 'page'),
];

export default async function SecurityActivityPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recentActivities);
    return <SecurityActivityPageClient />;
}
