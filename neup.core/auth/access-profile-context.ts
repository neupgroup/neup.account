'use server';

import { getUrlParam } from '@/neup.core/helper/urlHelper';
import { getPersonalAccountId } from '@/neup.core/auth/verify';
import {
  getAccountPermission,
  getGrantedAccountPermission,
} from '@/services/user';
import { hasAnyPermission } from '@/neup.core/auth/profile-permissions';
import {
  getCanonicalPermissionAudience,
  resolveNeupAccountPermissionCandidates,
  stripPermissionAudience,
} from '@/services/neup-account/permission-catalog';

/**
 * ::neup.documentation::access-profile-context
 * ::title Access Profile Context
 *
 * Resolves the signed-in, working, and selected profiles used by access-management pages.
 *
 * ::public
 *
 * Access pages use `signedInProfile` to identify the logged-in account, `workingProfile` to identify the account being used as the actor, and `selectedProfile` to identify the account whose access data is being viewed.
 *
 * ::public end
 *
 * ::private
 *
 * The resolver prevents chained delegation by requiring a delegated working profile to be the same as the selected profile. Viewing another selected profile is allowed only when the signed-in profile has direct root-style permission or delegated managed permission for that selected profile.
 *
 * ::private end
 *
 * ::end
 */

export type AccessProfileContext = {
  signedInProfile: string;
  workingProfile: string;
  selectedProfile: string;
  permissions: string[];
  isSelf: boolean;
  isWorkingAsSignedIn: boolean;
  accessMode: 'self' | 'managed' | 'root';
};

type ResolveAccessProfileContextInput = {
  selectedProfile?: string | null;
  workingProfile?: string | null;
  requiredPermissions?: readonly string[];
};

function normalizeProfileId(profileId?: string | null): string | null {
  const normalized = profileId?.trim();
  return normalized ? normalized : null;
}

function hasAnyRootPermission(
  grantedPermissions: string[],
  requiredPermissions: readonly string[],
): boolean {
  if (!requiredPermissions.length) return true;

  const granted = new Set(grantedPermissions);
  return requiredPermissions.some((requiredPermission) => {
    const permissionBase = getCanonicalPermissionAudience(requiredPermission)
      ? stripPermissionAudience(requiredPermission)
      : requiredPermission;

    return resolveNeupAccountPermissionCandidates(permissionBase, 'root')
      .some((candidate) => granted.has(candidate));
  });
}

export async function getSignedInProfile(): Promise<string | null> {
  return getPersonalAccountId();
}

export async function getWorkingProfile(
  explicitWorkingProfile?: string | null,
  signedInProfile?: string | null,
): Promise<string | null> {
  const signedIn = signedInProfile ?? await getSignedInProfile();
  if (!signedIn) return null;

  return (
    normalizeProfileId(await getUrlParam('workingProfile', explicitWorkingProfile)) ??
    signedIn
  );
}

export async function resolveAccessProfileContext(
  input: ResolveAccessProfileContextInput = {},
): Promise<AccessProfileContext | null> {
  const requiredPermissions = input.requiredPermissions ?? [];
  const signedInProfile = await getSignedInProfile();
  if (!signedInProfile) return null;

  const workingProfile = await getWorkingProfile(input.workingProfile, signedInProfile);
  if (!workingProfile) return null;

  const selectedProfile =
    normalizeProfileId(await getUrlParam('selectedProfile', input.selectedProfile)) ??
    workingProfile;

  if (workingProfile !== signedInProfile && workingProfile !== selectedProfile) {
    return null;
  }

  const signedInPermissions = await getAccountPermission(signedInProfile);

  if (selectedProfile === signedInProfile) {
    if (!hasAnyPermission(signedInPermissions, requiredPermissions)) return null;

    return {
      signedInProfile,
      workingProfile,
      selectedProfile,
      permissions: signedInPermissions,
      isSelf: true,
      isWorkingAsSignedIn: workingProfile === signedInProfile,
      accessMode: 'self',
    };
  }

  const managedPermissions = await getGrantedAccountPermission(signedInProfile, selectedProfile);
  const hasManagedAccess = hasAnyPermission(managedPermissions, requiredPermissions);
  const hasRootAccess = hasAnyRootPermission(signedInPermissions, requiredPermissions);

  if (!hasManagedAccess && !hasRootAccess) {
    return null;
  }

  return {
    signedInProfile,
    workingProfile,
    selectedProfile,
    permissions: hasManagedAccess ? managedPermissions : signedInPermissions,
    isSelf: false,
    isWorkingAsSignedIn: workingProfile === signedInProfile,
    accessMode: hasManagedAccess ? 'managed' : 'root',
  };
}
