import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import BackupCodesPageClient from './page.client';

export default async function BackupCodesPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.backup);
    return <BackupCodesPageClient />;
}
