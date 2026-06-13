import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import RecoveryPhonePageClient from './page.client';

export default async function RecoveryPhonePage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recoveryPhone);
    return <RecoveryPhonePageClient />;
}
