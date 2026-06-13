import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import RecoveryEmailPageClient from './page.client';

export default async function RecoveryEmailPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recoveryEmail);
    return <RecoveryEmailPageClient />;
}
