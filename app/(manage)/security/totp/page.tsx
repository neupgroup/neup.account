import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/logica/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/logica/account/security-permissions';
import AuthenticatorAppPageClient from './page.client';

const pagePermissions = [
    permission('security.totp.add.self', 'for_individual', 'page'),
    permission('security.totp.remove.self', 'for_individual', 'page'),
];

export default async function AuthenticatorAppPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.totp);
    return <AuthenticatorAppPageClient />;
}
