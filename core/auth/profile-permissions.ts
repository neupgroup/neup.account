import { checkGrantedPermissions, checkPermissions, getAccountPermission, getCurrentAccountPermission } from '@/services/user';
import { notFound } from 'next/navigation';
import { getAccountSelectorContext } from '@/core/auth/accountSelector';

export const PROFILE_DISPLAY_PERMISSION_GROUPS = {
  self: ['profile.display.name', 'profile.display.update'],
  managed: ['profile.display.view', 'profile.display.update'],
  root: ['profile.display.view.root', 'profile.display.update.root'],
} as const;

export const PROFILE_SECTION_PERMISSIONS = {
  display: [
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.self,
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.managed,
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.root,
  ],
  legal: ['profile.legal.view', 'profile.legal.update'],
  demographics: ['profile.demographics.view', 'profile.demographics.update'],
  neupid: ['profile.neupid.update', 'profile.neupid.request', 'profile.neupid.remove'],
  contact: ['profile.contact.view', 'profile.contact.update'],
  kyc: ['profile.kyc.view', 'profile.kyc.update'],
} as const;

export const PROFILE_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(PROFILE_SECTION_PERMISSIONS).flat()),
);

export const NOTIFICATION_PERMISSIONS = [
  'notification.read',
  'notification.delete',
] as const;

export function hasAnyPermission(
  grantedPermissions: string[] | null | undefined,
  requiredPermissions: readonly string[],
): boolean {
  if (!requiredPermissions.length) return true;
  if (!grantedPermissions) return false;

  const granted = new Set(grantedPermissions);
  return requiredPermissions.some((permission) => granted.has(permission));
}

export async function assertHasAnyPermission(
  requiredPermissions: readonly string[],
  accountId?: string,
): Promise<void> {
  const grantedPermissions = accountId
    ? await getAccountPermission(accountId)
    : await getCurrentAccountPermission();
  if (!hasAnyPermission(grantedPermissions, requiredPermissions)) {
    notFound();
  }
}

export async function hasSelectedAccountAnyPermission(
  targetAccountId: string,
  requiredPermissions: readonly string[],
): Promise<boolean> {
  if (!requiredPermissions.length) return true;

  const { personalAccountId, isSelf } = await getAccountSelectorContext();
  if (!personalAccountId) return false;

  if (isSelf && targetAccountId === personalAccountId) {
    return checkPermissions(requiredPermissions);
  }

  const results = await Promise.all(
    requiredPermissions.map((permission) =>
      checkGrantedPermissions([permission], personalAccountId, targetAccountId)
    )
  );

  return results.some(Boolean);
}

export async function assertHasSelectedAccountAnyPermission(
  targetAccountId: string,
  requiredPermissions: readonly string[],
): Promise<void> {
  const canAccess = await hasSelectedAccountAnyPermission(targetAccountId, requiredPermissions);
  if (!canAccess) {
    notFound();
  }
}

export async function hasProfileDisplayPermission(
  targetAccountId: string,
  action: 'view' | 'update',
): Promise<boolean> {
  const { personalAccountId, isSelf } = await getAccountSelectorContext();
  if (!personalAccountId) return false;

  const selfPermission = action === 'view'
    ? PROFILE_DISPLAY_PERMISSION_GROUPS.self[0]
    : PROFILE_DISPLAY_PERMISSION_GROUPS.self[1];
  const managedPermission = action === 'view'
    ? PROFILE_DISPLAY_PERMISSION_GROUPS.managed[0]
    : PROFILE_DISPLAY_PERMISSION_GROUPS.managed[1];
  const rootPermission = action === 'view'
    ? PROFILE_DISPLAY_PERMISSION_GROUPS.root[0]
    : PROFILE_DISPLAY_PERMISSION_GROUPS.root[1];

  if (isSelf && targetAccountId === personalAccountId) {
    return (
      await checkPermissions([selfPermission]) ||
      await checkPermissions([rootPermission])
    );
  }

  const [canManageTarget, canRootAccess] = await Promise.all([
    checkGrantedPermissions([managedPermission], personalAccountId, targetAccountId),
    checkPermissions([rootPermission]),
  ]);

  return canManageTarget || canRootAccess;
}

export async function assertHasProfileDisplayPermission(
  targetAccountId: string,
  action: 'view' | 'update',
): Promise<void> {
  const canAccess = await hasProfileDisplayPermission(targetAccountId, action);
  if (!canAccess) {
    notFound();
  }
}
