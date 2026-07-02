'use server';

import { permission } from '@/logica/permission';
import prisma from '@/core/helpers/prisma';
import { verifyAccountToken } from '@/core/auth/accountToken';
import { logError } from '@/core/helpers/logger';
import { cleanupExpiredAccessModel } from '@/services/access-model';
import { validateAuthSession } from '@/services/auth/session';
import { checkGrantedPermissions, checkPermissions, getUserNeupIds, getUserProfile } from '@/services/user';
import { ACCESS_CONNECTION_VIEW_PERMISSIONS } from '@/core/auth/access-view-permissions';

const servicePermissions = [
  permission('access.connection.view.self', 'for_individual', 'service'),
];

/*
::neup.documentation::connection-members-service
::title Connection Members Service

Resolves the accounts associated with a specific application connection.

::public

This file owns session-backed authorization, managed-profile permission checks, connection lookup, and member/role response shaping for connection-member reads.

::public end

::private

The route file owns the HTTP contract and parameter normalization. This file owns auth validation and the connection-member query semantics.

::private end

::end
*/

type ConnectionMemberRole = {
  roleId: string;
  roleName: string | null;
  roleDescription: string | null;
};

type ConnectionMember = {
  accountId: string;
  displayName: string;
  neupId: string;
  accountPhoto?: string;
  accountType?: string;
  roles: ConnectionMemberRole[];
  grantCount: number;
};

export type ConnectionMembersResult =
  | {
      status: 200;
      body: {
        success: true;
        requesterAccountId: string;
        profileAccountId: string;
        isManagedProfile: boolean;
        connection: {
          id: string;
          appId: string;
          appName: string;
          appDescription: string | null;
          appIcon: string | null;
          appStatus: string | null;
          connectedAt: string;
          connectionStatus: string;
          roleId: string | null;
          roleName: string | null;
          roleDescription: string | null;
          accessCount: number;
          members: ConnectionMember[];
        };
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
  /*
  ::neup.documentation::connection-members-resolve-display-name
  ::function resolveDisplayName(accountId, profile)

  Resolves the preferred display label for a member account.

  ::public

  Uses the profile display name when present, falls back to the first-and-last-name combination, and finally to the raw account ID.

  ::public end

  ::private

  This keeps member shaping deterministic even when profile records are incomplete.

  ::private end

  ::end
  */
  return (
    profile?.nameDisplay ||
    `${profile?.nameFirst ?? ''} ${profile?.nameLast ?? ''}`.trim() ||
    accountId
  );
}

async function canViewConnectionsForProfile(
  requesterAccountId: string,
  profileAccountId: string,
): Promise<boolean> {
  /*
  ::neup.documentation::connection-members-can-view-connections-for-profile
  ::function canViewConnectionsForProfile(requesterAccountId, profileAccountId)

  Determines whether the requester can view connections for the target profile.

  ::public

  Self-lookups require direct `access.connection.view` permission on the requester account. Managed-profile lookups require the same permission to be granted from the target profile.

  ::public end

  ::private

  The helper centralizes the self-versus-granted permission branch so route and service callers do not duplicate authorization rules.

  ::private end

  ::end
  */
  if (requesterAccountId === profileAccountId) {
    return checkPermissions([...ACCESS_CONNECTION_VIEW_PERMISSIONS], requesterAccountId);
  }

  return checkGrantedPermissions(
    [...ACCESS_CONNECTION_VIEW_PERMISSIONS],
    requesterAccountId,
    profileAccountId,
  );
}

export async function getConnectionMembers(input: {
  connectionId: string | null;
  authToken: string | null;
  profileAccountId?: string | null;
}): Promise<ConnectionMembersResult> {
  /*
  ::neup.documentation::get-connection-members
  ::function getConnectionMembers(input)

  Returns the member accounts associated with a connection for the requested profile.

  ::public

  Requires a valid account session token and `access.connection.view` permission on the requested profile. Supports both self and managed-profile lookups.

  ::public end

  ::private

  The implementation validates the base account token/session, checks self-or-managed connection visibility, resolves the profile-owned connection row, and groups active app access rows into member records with role summaries.

  ::private end

  ::end
  */
  const connectionId = input.connectionId?.trim() || '';
  const authToken = input.authToken?.trim() || '';
  const requestedProfileAccountId = input.profileAccountId?.trim() || null;

  if (!connectionId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: '`connection` is required.',
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

    const requesterAccountId = payload.aid;
    const profileAccountId = requestedProfileAccountId || requesterAccountId;
    const isManagedProfile = profileAccountId !== requesterAccountId;

    const canViewConnections = await canViewConnectionsForProfile(
      requesterAccountId,
      profileAccountId,
    );

    if (!canViewConnections) {
      return {
        status: 403,
        body: {
          success: false,
          error: 'forbidden',
          error_description: 'You do not have permission to view connections for the requested profile.',
        },
      };
    }

    await cleanupExpiredAccessModel();

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        accountId: profileAccountId,
        appId: { not: 'neup.account' },
      },
      select: {
        id: true,
        accountId: true,
        connectedAt: true,
        status: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        application: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            status: true,
          },
        },
      },
    });

    if (!connection) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'connection_not_found',
          error_description: 'Connection not found for the requested profile.',
        },
      };
    }

    const accessRows = await prisma.access.findMany({
      where: {
        parentAccountId: profileAccountId,
        accessApplicationId: connection.application.id,
        memberAccountId: { not: null },
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        role: {
          appId: connection.application.id,
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

        const roleMap = new Map<string, ConnectionMemberRole>();
        for (const row of rows) {
          if (roleMap.has(row.roleId)) continue;
          roleMap.set(row.roleId, {
            roleId: row.role.id,
            roleName: row.role.name,
            roleDescription: row.role.description ?? null,
          });
        }

        return {
          accountId: memberAccountId,
          displayName: resolveDisplayName(memberAccountId, profile),
          neupId: neupIds[0] || 'N/A',
          accountPhoto: profile?.accountPhoto,
          accountType: profile?.accountType,
          roles: Array.from(roleMap.values()),
          grantCount: rows.length,
        } satisfies ConnectionMember;
      }),
    );

    return {
      status: 200,
      body: {
        success: true,
        requesterAccountId,
        profileAccountId,
        isManagedProfile,
        connection: {
          id: connection.id,
          appId: connection.application.id,
          appName: connection.application.name,
          appDescription: connection.application.description,
          appIcon: connection.application.icon,
          appStatus: connection.application.status,
          connectedAt: connection.connectedAt.toISOString(),
          connectionStatus: connection.status,
          roleId: connection.role?.id ?? null,
          roleName: connection.role?.name ?? null,
          roleDescription: connection.role?.description ?? null,
          accessCount: accessRows.length,
          members,
        },
      },
    };
  } catch (error) {
    await logError('auth', error, `access/connection:${connectionId}`);
    return {
      status: 500,
      body: {
        success: false,
        error: 'internal_server_error',
        error_description: 'Internal server error.',
      },
    };
  }
}
