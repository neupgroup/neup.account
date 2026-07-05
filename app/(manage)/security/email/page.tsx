import { permission } from '@/neup.logica/permission';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/neup.core/auth/security-permissions';
import RecoveryEmailPageClient from './page.client';

const pagePermissions = [
    permission('security.recovery_email.view.self', 'for_individual', 'page'),
    permission('security.recovery_email.add.self', 'for_individual', 'page'),
    permission('security.recovery_email.remove.self', 'for_individual', 'page'),
];

export default async function RecoveryEmailPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recoveryEmail);
    return <RecoveryEmailPageClient />;
}
