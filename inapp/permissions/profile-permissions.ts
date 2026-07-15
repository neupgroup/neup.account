import {
  getCanonicalPermissionAudience,
  resolveNeupAccountPermissionCandidates,
  stripPermissionAudience,
} from '@/inapp/permissions/permission-catalog';

/**
 * ::neup.documentation::inapp-permissions-profile-permissions
 * ::title In-App Profile Permissions
 *
 * Shared profile permission groups and pure permission matching helpers.
 *
 * ::public
 *
 * This module is safe to import from server and client code because it only exports static permission groups and a pure matcher.
 *
 * ::public end
 *
 * ::private
 *
 * Permission matching expands canonical names into compatible self, managed, and root candidates so legacy names still resolve correctly.
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
  if (!requiredPermissions.length) return true;
  if (!grantedPermissions) return false;

  const granted = new Set(grantedPermissions);
  return requiredPermissions.some((permission) => {
    const permissionBase = getCanonicalPermissionAudience(permission)
      ? stripPermissionAudience(permission)
      : permission;

    return Array.from(
      new Set([
        ...resolveNeupAccountPermissionCandidates(permissionBase, 'selfOrRoot'),
        ...resolveNeupAccountPermissionCandidates(permissionBase, 'managed'),
      ]),
    ).some((candidate) => granted.has(candidate));
  });
}
