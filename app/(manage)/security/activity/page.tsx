import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import SecurityActivityPageClient from './page.client';

export default async function SecurityActivityPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recentActivities);
    return <SecurityActivityPageClient />;
}
