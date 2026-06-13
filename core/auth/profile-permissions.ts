import { getAccountPermission } from '@/services/user';
import { notFound } from 'next/navigation';

export const PROFILE_SECTION_PERMISSIONS = {
  display: ['self.profile.display.view', 'self.profile.display.update'],
  legal: ['self.profile.legal.view', 'self.profile.legal.update'],
  demographics: ['self.profile.demographics.view', 'self.profile.demographics.update'],
  neupid: ['self.profile.neupid.view', 'self.profile.neupid.request', 'self.profile.neupid.remove'],
  contact: ['self.profile.contact.view', 'self.profile.contact.update'],
  kyc: ['self.profile.kyc.view', 'self.profile.kyc.update'],
} as const;

export const PROFILE_NAV_PERMISSIONS = Array.from(
  new Set(Object.values(PROFILE_SECTION_PERMISSIONS).flat()),
);

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
  const grantedPermissions = await getAccountPermission(accountId);
  if (!hasAnyPermission(grantedPermissions, requiredPermissions)) {
    notFound();
  }
}
