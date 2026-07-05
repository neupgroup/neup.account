import { permission } from '@/neup.logica/permission';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/neup.core/auth/security-permissions';
import DataActivityPageClient from './page.client';

const pagePermissions = [
    permission('security.recent_activities.view.self', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-data-activity-page
 * ::title Recent Activity Page
 *
 * Server entry point for the recent account activity screen.
 *
 * ::public
 *
 * This page checks recent-activity access and then renders the client page that displays account activity history.
 *
 * ::public end
 *
 * ::private
 *
 * Authorization uses the shared security permission group and resolves through `requireAnyPermission404()`.
 *
 * ::private end
 *
 * ::end
 */
export default async function DataActivityPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recentActivities);
    return <DataActivityPageClient />;
}
