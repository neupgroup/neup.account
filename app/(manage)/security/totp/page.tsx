import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import AuthenticatorAppPageClient from './page.client';

export default async function AuthenticatorAppPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.totp);
    return <AuthenticatorAppPageClient />;
}
