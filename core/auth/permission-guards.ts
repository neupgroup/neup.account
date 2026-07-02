import { notFound } from 'next/navigation';
import { getAccountPermission, getCurrentAccountPermission } from '@/services/user';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import { permission } from '@/logica/permission';

const helperPermissions = [
  permission('root.account.view', 'for_individual', 'helper'),
  permission('profile.display.view.self', 'for_individual', 'helper'),
  permission('profile.display.view.managed', 'for_individual', 'helper'),
  permission('profile.display.view.root', 'for_individual', 'helper'),
];

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
