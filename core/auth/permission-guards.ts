import { notFound } from 'next/navigation';
import { getAccountPermission } from '@/services/user';
import { hasAnyPermission } from '@/core/auth/profile-permissions';

export async function requireAnyPermission404(
  requiredPermissions: readonly string[],
  accountId?: string,
): Promise<void> {
  if (!requiredPermissions.length) return;

  const grantedPermissions = await getAccountPermission(accountId);
  if (!hasAnyPermission(grantedPermissions, requiredPermissions)) {
    notFound();
  }
}
