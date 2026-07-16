'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { verifyAccountToken } from '@/services/auth/account-token';
import { logError } from '@/logica/logger/files';
import { cleanupExpiredAccessModel, extractRolePermissionNames } from '@/services/access-model';
import { validateAuthSession } from '@/services/auth/session';
import { deriveLegacyRoleScopesFromPolicy, normalizeAuthzScopeFor, normalizeSingleAuthzScopeLevel } from '@/services/applications/authz-scope-policy';
import { checkGrantedPermissions, getUserNeupIds, getUserProfile } from '@/services/user';

const servicePermissions = [
  permission('access.view', 'for_individual', 'service'),
  permission('access.team.view', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::application-team-service-module
 * ::title Application Team Bridge Service
 *
 * Provides the bridge-facing team roster for one application's access grants.
 *
 * ::public
 *
 * This service returns the effective team members, granted roles, and deduplicated permission list for an application's active access rows.
 *
 * ::public end
 *
 * ::private
 *
 * The implementation validates account-session state, applies managed-profile access checks, cleans expired access grants, and folds multiple access rows into per-member role summaries.
 *
 * ::private end
 *
 * ::end
 */
type ApplicationTeamMemberRole = {
  roleId: string;
  roleName: string | null;
  roleDescription: string | null;
  roleScope: string[] | null;
  permissions: string[];
  grantCount: number;
};

type ApplicationTeamMember = {
  accountId: string;
  displayName: string;
  neupId: string;
  accountPhoto?: string;
  accountType?: string;
  roles: ApplicationTeamMemberRole[];
  permissions: string[];
  grantCount: number;
};

export type ApplicationTeamResult =
  | {
      status: 200;
      body: {
        success: true;
        appId: string;
        requesterAccountId: string;
        profileAccountId: string;
        isManagedProfile: boolean;
        totalMembers: number;
        members: ApplicationTeamMember[];
      };
    }
  | {
      status: 400 | 401 | 403 | 404 | 500;
      body: {
        success: false;
        error: string;
        error_description?: string;
      };
    };

function resolveDisplayName(
  accountId: string,
  profile: Awaited<ReturnType<typeof getUserProfile>>,
): string {
  /**
   * ::neup.documentation::application-team-service-resolve-display-name
   * ::function resolveDisplayName(accountId, profile)
   *
   * Chooses the best available display label for one member account.
   *
   * ::public
   *
   * Prefers the stored display name, then a first/last-name combination, and finally falls back to the raw account ID.
   *
   * ::public end
   *
   * ::private
   *
   * This keeps bridge responses stable even when profile data is partially missing.
   *
   * ::private end
   *
   * ::end
   */
  return (
    profile?.nameDisplay ||
    `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
    accountId
  );
}

async function canAccessManagedProfile(
  requesterAccountId: string,
  profileAccountId: string,
): Promise<boolean> {
  /**
   * ::neup.documentation::application-team-service-can-access-managed-profile
   * ::function canAccessManagedProfile(requesterAccountId, profileAccountId)
   *
   * Checks whether the requester may inspect access data for another managed profile.
   *
   * ::public
   *
   * Access is granted when the requester holds either `access.view` or `access.team.view` on the target profile.
   *
   * ::public end
   *
   * ::private
   *
   * The helper evaluates both permissions in parallel and treats either result as sufficient for this read-only bridge operation.
   *
   * ::private end
   *
   * ::end
   */
  const [canViewAccess, canViewTeam] = await Promise.all([
    checkGrantedPermissions(['access.view'], requesterAccountId, profileAccountId),
    checkGrantedPermissions(['access.team.view'], requesterAccountId, profileAccountId),
  ]);

  return canViewAccess || canViewTeam;
}

export async function getApplicationTeamMembers(input: {
  appId: string | null;
  authToken: string | null;
  profileAccountId?: string | null;
}): Promise<ApplicationTeamResult> {
  /**
   * ::neup.documentation::application-team-service-get-application-team-members
   * ::function getApplicationTeamMembers(input)
   *
   * Returns the active application-team membership for one profile/application pair.
   *
   * ::public
   *
   * The service validates the caller, confirms the application exists, resolves the target profile, and returns the active members with their effective roles and permission set.
   *
   * ::public end
   *
   * ::private
   *
   * Only active `access` rows with a non-expired temporary window and a role tied to the requested application are included in the result.
   *
   * ::private end
   *
   * ::param external input
   * ::datatype object
   * ::required true
   *
   * Bridge request parameters including `appId`, `authToken`, and optional `profileAccountId`.
   *
   * ::returns ApplicationTeamResult
   *
   * Structured success or failure payload with the correct HTTP status already attached.
   *
   * ::end
   */
  const appId = input.appId?.trim() || '';
  const authToken = input.authToken?.trim() || '';
  const requestedProfileAccountId = input.profileAccountId?.trim() || null;

  if (!appId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: '`app` is required.',
      },
    };
  }

  if (!authToken) {
    return {
      status: 401,
      body: {
        success: false,
        error: 'unauthorized',
        error_description: 'An `auth` header or `auth_account` cookie is required.',
      },
    };
  }

  try {
    const payload = await verifyAccountToken(authToken);
    if (!payload?.aid || !payload.sid || !payload.skey) {
      return {
        status: 401,
        body: {
          success: false,
          error: 'unauthorized',
          error_description: 'Invalid auth token.',
        },
      };
    }

    const session = await validateAuthSession({
      aid: payload.aid,
      sid: payload.sid,
      skey: payload.skey,
    });

    if (session.status !== 'valid') {
      return {
        status: 401,
        body: {
          success: false,
          error: 'unauthorized',
          error_description: 'Session is invalid or expired.',
        },
      };
    }

    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true },
    });

    if (!application) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'app_not_found',
          error_description: 'Application not found.',
        },
      };
    }

    const requesterAccountId = payload.aid;
    const profileAccountId = requestedProfileAccountId || requesterAccountId;
    const isManagedProfile = profileAccountId !== requesterAccountId;

    if (isManagedProfile) {
      const allowed = await canAccessManagedProfile(requesterAccountId, profileAccountId);
      if (!allowed) {
        return {
          status: 403,
          body: {
            success: false,
            error: 'forbidden',
            error_description: 'You do not have access to the requested profile.',
          },
        };
      }
    }

    await cleanupExpiredAccessModel();

    const accessRows = await prisma.access.findMany({
      where: {
        parentAccountId: profileAccountId,
        accessApplicationId: appId,
        memberAccountId: { not: null },
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId,
        },
      },
      select: {
        id: true,
        memberAccountId: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            scopeFor: true,
            scopeLevel: true,
            permissions: true,
          },
        },
      },
      orderBy: [
        { memberAccountId: 'asc' },
        { roleId: 'asc' },
        { id: 'asc' },
      ],
    });

    const grouped = new Map<string, typeof accessRows>();
    for (const row of accessRows) {
      if (!row.memberAccountId) continue;
      const existing = grouped.get(row.memberAccountId);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(row.memberAccountId, [row]);
      }
    }

    const members = await Promise.all(
      Array.from(grouped.entries()).map(async ([memberAccountId, rows]) => {
        const [profile, neupIds] = await Promise.all([
          getUserProfile(memberAccountId),
          getUserNeupIds(memberAccountId),
        ]);

        const roleMap = new Map<string, ApplicationTeamMemberRole>();
        for (const row of rows) {
          const existing = roleMap.get(row.roleId);
          const permissionNames = extractRolePermissionNames(row.role.permissions);

          if (existing) {
            existing.permissions = Array.from(new Set([...existing.permissions, ...permissionNames]));
            existing.grantCount += 1;
            continue;
          }

          roleMap.set(row.roleId, {
            roleId: row.role.id,
            roleName: row.role.name,
            roleDescription: row.role.description ?? null,
            roleScope: deriveLegacyRoleScopesFromPolicy(
              normalizeAuthzScopeFor(row.role.scopeFor),
              normalizeSingleAuthzScopeLevel(row.role.scopeLevel),
            ),
            permissions: Array.from(new Set(permissionNames)),
            grantCount: 1,
          });
        }

        const roles = Array.from(roleMap.values());
        const permissions = Array.from(
          new Set(roles.flatMap((role) => role.permissions)),
        ).sort((a, b) => a.localeCompare(b));

        return {
          accountId: memberAccountId,
          displayName: resolveDisplayName(memberAccountId, profile),
          neupId: neupIds[0] || 'N/A',
          accountPhoto: profile?.accountPhoto,
          accountType: profile?.accountType,
          roles,
          permissions,
          grantCount: rows.length,
        };
      }),
    );

    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return {
      status: 200,
      body: {
        success: true,
        appId,
        requesterAccountId,
        profileAccountId,
        isManagedProfile,
        totalMembers: members.length,
        members,
      },
    };
  } catch (error) {
    await logError(
      'database',
      error,
      `getApplicationTeamMembers:${appId}:${requestedProfileAccountId ?? 'self'}`,
    );
    return {
      status: 500,
      body: {
        success: false,
        error: 'internal_server_error',
      },
    };
  }
}
