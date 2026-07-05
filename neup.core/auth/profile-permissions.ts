import { checkGrantedPermissions, checkPermissions, getAccountPermission, getCurrentAccountPermission } from '@/services/user';
import { notFound } from 'next/navigation';
import { getAccountSelectorContext } from '@/neup.core/auth/accountSelector';
import { permission } from '@/neup.logica/permission';
import {
  getCanonicalPermissionAudience,
  resolveNeupAccountPermissionCandidates,
  stripPermissionAudience,
} from '@/services/neup-account/permission-catalog';

const helperPermissions = [
  permission('profile.display.view.self', 'for_individual', 'helper'),
  permission('profile.display.update.self', 'for_individual', 'helper'),
  permission('profile.display.view.managed', 'for_individual', 'helper'),
  permission('profile.display.update.managed', 'for_individual', 'helper'),
  permission('profile.display.view.root', 'for_individual', 'helper'),
  permission('profile.display.update.root', 'for_individual', 'helper'),
  permission('profile.legal.view.self', 'for_individual', 'helper'),
  permission('profile.legal.update.self', 'for_individual', 'helper'),
  permission('profile.demographics.view.self', 'for_individual', 'helper'),
  permission('profile.demographics.update.self', 'for_individual', 'helper'),
  permission('profile.neupid.view.self', 'for_individual', 'helper'),
  permission('profile.neupid.update.self', 'for_individual', 'helper'),
  permission('profile.neupid.request.self', 'for_individual', 'helper'),
  permission('profile.neupid.remove.self', 'for_individual', 'helper'),
  permission('profile.contact.view.self', 'for_individual', 'helper'),
  permission('profile.contact.update.self', 'for_individual', 'helper'),
  permission('profile.kyc.view.self', 'for_individual', 'helper'),
  permission('profile.kyc.update.self', 'for_individual', 'helper'),
  permission('notification.read.self', 'for_individual', 'helper'),
  permission('notification.delete.self', 'for_individual', 'helper'),
];

/**
 * ::neup.documentation::profile-permissions-module
 * ::title Profile Permission Helpers
 *
 * Centralizes profile-section permission groups and authorization helpers.
 *
 * ::public
 *
 * Use this module to check whether the current or selected account may access profile sections such as display, legal, contact, and KYC data.
 *
 * ::public end
 *
 * ::private
 *
 * These helpers normalize canonical self, managed, and root permission variants and intentionally use `notFound()` for UI-gated authorization failures.
 *
 * ::private end
 *
 * ::end
 */
export const PROFILE_DISPLAY_PERMISSION_GROUPS = {
  self: ['profile.display.view', 'profile.display.update'],
  managed: ['profile.display.view', 'profile.display.update'],
  root: ['profile.display.view', 'profile.display.update'],
} as const;

export const PROFILE_SECTION_PERMISSIONS = {
  display: [
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.self,
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.managed,
    ...PROFILE_DISPLAY_PERMISSION_GROUPS.root,
  ],
  legal: ['profile.legal.view', 'profile.legal.update'],
  demographics: ['profile.demographics.view', 'profile.demographics.update'],
  neupid: ['profile.neupid.view', 'profile.neupid.update', 'profile.neupid.request', 'profile.neupid.remove'],
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
  /**
   * ::neup.documentation::profile-permissions-has-any-permission
   * ::function hasAnyPermission(grantedPermissions, requiredPermissions)
   *
   * Checks whether any granted permission satisfies the required profile permission set.
   *
   * ::public
   *
   * This helper understands canonical self, managed, and root permission variants, so callers can pass normalized required permission names.
   *
   * ::public end
   *
   * ::private
   *
   * Self permissions are expanded through the Neup Account candidate resolver so legacy and canonical permission naming remain compatible.
   *
   * ::private end
   *
   * ::end
   */
  if (!requiredPermissions.length) return true;
  if (!grantedPermissions) return false;

  const granted = new Set(grantedPermissions);
  return requiredPermissions.some((permission) => {
    const permissionBase = getCanonicalPermissionAudience(permission)
      ? stripPermissionAudience(permission)
      : permission;
    return (
      Array.from(new Set([
        ...resolveNeupAccountPermissionCandidates(permissionBase, 'selfOrRoot'),
        ...resolveNeupAccountPermissionCandidates(permissionBase, 'managed'),
      ])).some((candidate) => granted.has(candidate))
    );
  });
}

export async function assertHasAnyPermission(
  requiredPermissions: readonly string[],
  accountId?: string,
): Promise<void> {
  /**
   * ::neup.documentation::profile-permissions-assert-has-any-permission
   * ::function assertHasAnyPermission(requiredPermissions, accountId)
   *
   * Throws a `notFound()` navigation result when the account lacks the required profile permissions.
   *
   * ::public
   *
   * Use this in server-rendered profile screens that should disappear rather than show an explicit authorization error.
   *
   * ::public end
   *
   * ::private
   *
   * The helper checks either a supplied account ID or the current selected-account context.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::profile-permissions-has-selected-account-any-permission
   * ::function hasSelectedAccountAnyPermission(targetAccountId, requiredPermissions)
   *
   * Checks whether the current selector context may access the target account with any required permission.
   *
   * ::public
   *
   * This helper distinguishes self access from delegated managed-account access automatically.
   *
   * ::public end
   *
   * ::private
   *
   * Managed-account checks use grant-specific permission evaluation; self checks use direct permission checks.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::profile-permissions-has-profile-display-permission
   * ::function hasProfileDisplayPermission(targetAccountId, action)
   *
   * Checks whether the current selector context may view or update display-profile data for one account.
   *
   * ::public
   *
   * The helper resolves the correct self, managed, and root permission variant for the requested action.
   *
   * ::public end
   *
   * ::private
   *
   * Root access is evaluated separately from managed-profile access so a root user can pass without an explicit grant on the target account.
   *
   * ::private end
   *
   * ::end
   */
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
