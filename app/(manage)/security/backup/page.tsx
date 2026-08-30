import { permission } from '@/.neup/logica/permission';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/inapp/permissions/security-permissions';
import BackupCodesPageClient from './page.client';

const pagePermissions = [
    permission('security.backup_codes.view.self', 'for_individual', 'page'),
    permission('security.backup_codes.create.self', 'for_individual', 'page'),
];

export default async function BackupCodesPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.backup);
    return <BackupCodesPageClient />;
}
