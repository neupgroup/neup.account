import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/logica/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/logica/account/security-permissions';
import PasswordPageClient from './page.client';

const pagePermissions = [
    permission('security.pass.modify.self', 'for_individual', 'page'),
];

export default async function ChangePasswordPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.password);
    return <PasswordPageClient />;
}
