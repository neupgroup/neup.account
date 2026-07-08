import { permission } from '@/neup.logica/permission';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import AuthenticatorAppPageClient from './page.client';

const pagePermissions = [
    permission('security.totp.add.self', 'for_individual', 'page'),
    permission('security.totp.remove.self', 'for_individual', 'page'),
];

export default async function AuthenticatorAppPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.totp);
    return <AuthenticatorAppPageClient />;
}
