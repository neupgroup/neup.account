import { notFound } from 'next/navigation';
import { getAccountPermission, getCurrentAccountPermission } from '@/services/user';
import { hasAnyPermission } from '@/core/auth/profile-permissions';

export async function requireAnyPermission404(
  requiredPermissions: readonly string[],
  accountId?: string,
): Promise<void> {
  if (!requiredPermissions.length) return;

  const grantedPermissions = accountId
    ? await getAccountPermission(accountId)
    : await getCurrentAccountPermission();

  if (!hasAnyPermission(grantedPermissions, requiredPermissions)) {
    notFound();
  }
}
