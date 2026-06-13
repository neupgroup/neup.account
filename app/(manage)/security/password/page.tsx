import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/core/auth/security-permissions';
import PasswordPageClient from './page.client';

export default async function ChangePasswordPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.password);
    return <PasswordPageClient />;
}
