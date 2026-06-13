import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import DataActivityPageClient from './page.client';

export default async function DataActivityPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recentActivities);
    return <DataActivityPageClient />;
}
