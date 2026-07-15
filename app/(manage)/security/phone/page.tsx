import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/inapp/permissions/security-permissions';
import RecoveryPhonePageClient from './page.client';

const pagePermissions = [
    permission('security.recovery_phone.view.self', 'for_individual', 'page'),
    permission('security.recovery_phone.add.self', 'for_individual', 'page'),
    permission('security.recovery_phone.remove.self', 'for_individual', 'page'),
];

export default async function RecoveryPhonePage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.recoveryPhone);
    return <RecoveryPhonePageClient />;
}
