'use server';

import { permission } from '@/.neup/logica/permission';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/.neup/core/database/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/services/account/verify';
import { getUserProfile } from '@/services/user';
import { logError } from '@/.neup/logica/logger/files';
import { cleanupExpiredAccessModel, ensureAccessGrant } from '@/services/access-model';
import { checkPermissions } from '@/services/user';
import {
  ACCESS_APPLICATION_ADD_PERMISSIONS,
  ACCESS_APPLICATION_REMOVE_PERMISSIONS,
  ACCESS_APPLICATION_VIEW_PERMISSIONS,
  ACCESS_CONNECTION_VIEW_PERMISSIONS,
} from '@/inapp/permissions/access-view-permissions';

const servicePermissions = [
  permission('access.application.view.self', 'for_individual', 'service'),
  permission('access.connection.view.self', 'for_individual', 'service'),
  permission('access.application.add', 'for_individual', 'managable'),
  permission('access.application.remove.self', 'for_individual', 'service'),
];

/*
::neup.documentation::access-connection-actions
::title Connection Access Actions

Loads connection-access pages and performs direct application-access assignments from the manage UI.

::public

This module backs the connection access pages by returning connection summaries, resolving NeupID lookups, and assigning or revoking app access for eligible accounts.

::public end

::private

Assignment is intentionally limited to accounts that already have an active connection for the target application and an active direct-team membership on the current account. The module no longer creates placeholder connection rows during access assignment.

::private end

::end
*/

export type AppWithAccess = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: string | null;
  connectedAt: Date;
  // Roles/permissions the current user holds on this app
  myRoles: Array<{ roleId: string }>;
  // Other accounts that have been granted access by the current user
  grantees: Array<{
    accountId: string;
    displayName: string;
    roles: string[];
  }>;
  // Roles available to assign (defined on this app)
  availableRoles: Array<{ id: string; name: string; description: string | null }>;
  // Whether the current user owns this app (can assign others)
  isOwner: boolean;
};

export type ConnectionPageItem = {
  id: string;
  appId: string;
  appName: string;
  appDescription: string | null;
  appIcon: string | null;
  appStatus: string | null;
  connectedAt: Date;
  connectionStatus: string;
  roleId: string | null;
  roleName: string | null;
  roleDescription: string | null;
  accessCount: number;
};

export type ConnectionAccessMember = {
  accountId: string;
  displayName: string;
  accountPhoto?: string;
  roles: Array<{
    roleId: string;
    roleName: string;
    roleDescription: string | null;
  }>;
};

function resolveProfileDisplayName(
  accountId: string,
  profile: Awaited<ReturnType<typeof getUserProfile>> | null,
): string {
  return (
    profile?.nameDisplay ||
    [profile?.nameFirst, profile?.nameLast].filter(Boolean).join(' ').trim() ||
    accountId
  );
}

export type ConnectionDetail = {
  id: string;
  appId: string;
  appName: string;
  appDescription: string | null;
  appIcon: string | null;
  appStatus: string | null;
  connectedAt: Date;
  connectionStatus: string;
  roleId: string | null;
  roleName: string | null;
  roleDescription: string | null;
  accessCount: number;
  availableRoles: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  canGrantDirectAccess: boolean;
  members: ConnectionAccessMember[];
};

export type ResolvedAccount = {
  accountId: string;
  displayName: string;
  teamMembershipStatus: 'active' | 'invited' | 'none';
};

type ApplicationAccessPageOptions = {
  ownerOnly?: boolean;
  accountId?: string | null;
  skipPermissionCheck?: boolean;
};

async function getDirectTeamMembershipStatus(
  ownerAccountId: string,
  memberAccountId: string,
): Promise<'active' | 'invited' | 'none'> {
  const [membership, pendingInvitation] = await Promise.all([
    prisma.member.findFirst({
      where: {
        memberType: 'acc_in_acc',
        memberAccountId,
        parentAccountId: ownerAccountId,
        status: 'active',
      },
      select: { id: true },
    }),
    prisma.request.findFirst({
      where: {
        action: 'access_invitation',
        senderId: ownerAccountId,
        recipientId: memberAccountId,
        status: 'pending',
      },
      select: { data: true },
    }),
  ]);

  if (membership) return 'active';
  if (pendingInvitation && !(pendingInvitation.data as Record<string, unknown> | null)?.parentPortfolioId) {
    return 'invited';
  }

  return 'none';
}

// ── Fetch page data ───────────────────────────────────────────────────────────

export async function getApplicationAccessPageData(
  options?: ApplicationAccessPageOptions,
): Promise<AppWithAccess[]> {
  if (!options?.skipPermissionCheck) {
    const canView = await checkPermissions([...ACCESS_APPLICATION_VIEW_PERMISSIONS]);
    if (!canView) return [];
  }

  const personalAccountId = options?.accountId ?? await getPersonalAccountId();
  if (!personalAccountId) return [];

  try {
    // All apps the user is connected to
    const connections = await prisma.connection.findMany({
      where: {
        accountId: personalAccountId,
        appId: { not: 'neup.account' },
      },
      select: {
        connectedAt: true,
        application: {
          select: { id: true, name: true, description: true, icon: true, status: true },
        },
      },
      orderBy: { connectedAt: 'desc' },
    });

    const results = await Promise.all(
      connections.map(async (conn) => {
        const app = conn.application;

        // Current user's own grants on this app
        const myGrants = await prisma.access.findMany({
          where: {
            memberAccountId: personalAccountId,
            accessApplicationId: app.id,
            status: 'active',
            OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
          },
          select: {
            roleId: true,
          },
        });

        // Grants the current user has issued to others on this app
        // (accessTo = current user, memberId != current user)
        const outboundGrants = await prisma.access.findMany({
          where: {
            parentAccountId: personalAccountId,
            NOT: { memberAccountId: personalAccountId },
            accessApplicationId: app.id,
            status: 'active',
            OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
          },
          select: {
            memberAccountId: true,
            roleId: true,
          },
        });

        // Group outbound grants by target account
        const granteeMap = new Map<string, string[]>();
        for (const g of outboundGrants) {
          if (!g.memberAccountId) continue;
          if (!granteeMap.has(g.memberAccountId)) granteeMap.set(g.memberAccountId, []);
          granteeMap.get(g.memberAccountId)!.push(g.roleId);
        }

        // Resolve display names for grantees
        const grantees = await Promise.all(
          Array.from(granteeMap.entries()).map(async ([accountId, roles]) => {
            const profile = await getUserProfile(accountId);
            const displayName =
              profile?.nameDisplay ||
              (profile?.nameFirst || profile?.nameLast
                ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
                : null) ||
              accountId;
            return { accountId, displayName, roles };
          }),
        );

        // Roles available on this app
        const availableRoles = await prisma.authzRole.findMany({
          where: { appId: app.id },
          select: { id: true, name: true, description: true },
          orderBy: { name: 'asc' },
        });

        const myRoleRows = myGrants.map((g) => ({ roleId: g.roleId }));
        const isOwner = myRoleRows.some((g) => g.roleId === 'application.owner');

        return {
          id: app.id,
          name: app.name,
          description: app.description,
          icon: app.icon,
          status: app.status,
          connectedAt: conn.connectedAt,
          myRoles: myRoleRows,
          grantees,
          availableRoles,
          isOwner,
        } satisfies AppWithAccess;
      }),
    );

    if (options?.ownerOnly) {
      return results.filter((app) => app.isOwner);
    }

    return results;
  } catch (error) {
    await logError('database', error, 'getApplicationAccessPageData');
    return [];
  }
}

export async function getConnectionPageData(
  selectedAccountId?: string | null,
  options: { skipPermissionCheck?: boolean } = {},
): Promise<ConnectionPageItem[]> {
  if (!options.skipPermissionCheck) {
    const canView = await checkPermissions([...ACCESS_CONNECTION_VIEW_PERMISSIONS]);
    if (!canView) return [];
  }

  const accountId = selectedAccountId ?? await getActiveAccountId();
  if (!accountId) return [];

  try {
    const connections = await prisma.connection.findMany({
      where: {
        accountId,
        appId: { not: 'neup.account' },
      },
      select: {
        id: true,
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
      orderBy: { connectedAt: 'desc' },
    }) as any[];

    return Promise.all(connections.map(async (connection) => {
      const accessRows = await prisma.access.findMany({
        where: {
          parentAccountId: accountId,
          accessApplicationId: connection.application.id,
          memberAccountId: { not: null },
          status: 'active',
          OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
        },
        select: {
          memberAccountId: true,
        },
      });
      const memberIds = new Set(
        accessRows
          .map((row) => row.memberAccountId)
          .filter((memberAccountId): memberAccountId is string => Boolean(memberAccountId)),
      );
      memberIds.add(accountId);

      return {
        id: connection.id,
        appId: connection.application.id,
        appName: connection.application.name,
        appDescription: connection.application.description,
        appIcon: connection.application.icon,
        appStatus: connection.application.status,
        connectedAt: connection.connectedAt,
        connectionStatus: connection.status,
        roleId: connection.role?.id ?? null,
        roleName: connection.role?.name ?? null,
        roleDescription: connection.role?.description ?? null,
        accessCount: memberIds.size,
      };
    }));
  } catch (error) {
    await logError('database', error, 'getConnectionPageData');
    return [];
  }
}

export async function getConnectionDetail(
  connectionId: string,
  selectedAccountId?: string | null,
  options: { skipPermissionCheck?: boolean } = {},
): Promise<ConnectionDetail | null> {
  if (!options.skipPermissionCheck) {
    const canView = await checkPermissions([...ACCESS_CONNECTION_VIEW_PERMISSIONS]);
    if (!canView) return null;
  }

  const accountId = selectedAccountId ?? await getActiveAccountId();
  if (!accountId) return null;

  try {
    const [connection, canGrantDirectAccess] = await Promise.all([
      prisma.connection.findFirst({
      where: {
        id: connectionId,
        accountId,
        appId: { not: 'neup.account' },
      },
      select: {
        id: true,
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
      }) as any,
      checkPermissions([...ACCESS_APPLICATION_ADD_PERMISSIONS]),
    ]);

    if (!connection) return null;

    const [accessRows, availableRoles] = await Promise.all([
      prisma.access.findMany({
      where: {
        parentAccountId: accountId,
        accessApplicationId: connection.application.id,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      },
      select: {
        memberAccountId: true,
        memberAccount: {
          select: {
            id: true,
            displayName: true,
            displayImage: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { memberAccountId: 'asc' },
      }),
      prisma.authzRole.findMany({
        where: { appId: connection.application.id },
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const memberMap = new Map<string, ConnectionAccessMember>();
    for (const row of accessRows) {
      const memberAccountId = row.memberAccountId;
      if (!memberAccountId) continue;

      const displayName =
        row.memberAccount?.displayName ||
        memberAccountId;

      const existing = memberMap.get(memberAccountId);
      const roles = [{
        roleId: row.role.id,
        roleName: row.role.name ?? row.role.id,
        roleDescription: row.role.description ?? null,
      }];

      if (existing) {
        const merged = new Map(existing.roles.map((role) => [role.roleId, role]));
        for (const role of roles) merged.set(role.roleId, role);
        existing.roles = Array.from(merged.values());
      } else {
        memberMap.set(memberAccountId, {
          accountId: memberAccountId,
          displayName,
          accountPhoto: row.memberAccount?.displayImage ?? undefined,
          roles,
        });
      }
    }

    const ownerProfile = await getUserProfile(accountId);
    const existingOwner = memberMap.get(accountId);
    const ownerRoles = existingOwner?.roles?.length
      ? existingOwner.roles
      : connection.role
      ? [{
          roleId: connection.role.id,
          roleName: connection.role.name ?? connection.role.id,
          roleDescription: connection.role.description ?? null,
        }]
      : [];

    memberMap.set(accountId, {
      accountId,
      displayName: resolveProfileDisplayName(accountId, ownerProfile),
      accountPhoto: ownerProfile?.accountPhoto,
      roles: ownerRoles,
    });

    const members = Array.from(memberMap.values()).sort((left, right) => {
      if (left.accountId === accountId) return -1;
      if (right.accountId === accountId) return 1;
      return left.displayName.localeCompare(right.displayName);
    });

    return {
      id: connection.id,
      appId: connection.application.id,
      appName: connection.application.name,
      appDescription: connection.application.description,
      appIcon: connection.application.icon,
      appStatus: connection.application.status,
      connectedAt: connection.connectedAt,
      connectionStatus: connection.status,
      roleId: connection.role?.id ?? null,
      roleName: connection.role?.name ?? null,
      roleDescription: connection.role?.description ?? null,
      accessCount: memberMap.size,
      availableRoles,
      canGrantDirectAccess,
      members,
    };
  } catch (error) {
    await logError('database', error, `getConnectionDetail:${connectionId}`);
    return null;
  }
}

// ── Resolve NeupID ────────────────────────────────────────────────────────────

export async function resolveNeupIdForApp(
  appId: string,
  neupId: string,
  selectedAccountId?: string | null,
): Promise<{ success: true; account: ResolvedAccount } | { success: false; error: string }> {
  const currentAccountId = await getActiveAccountId(selectedAccountId);
  if (!currentAccountId) {
    return { success: false, error: 'Not authenticated.' };
  }

  if (!appId.trim()) {
    return { success: false, error: 'Application is required.' };
  }

  const normalized = neupId.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return { success: false, error: 'NeupID must be at least 3 characters.' };
  }

  try {
    const [app, record] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: { id: true, name: true },
      }),
      prisma.neupId.findUnique({
      where: { id: normalized },
      select: { accountId: true },
      }),
    ]);

    if (!app) return { success: false, error: 'Application not found.' };

    if (!record) return { success: false, error: 'No account found with that NeupID.' };
    if (record.accountId === currentAccountId) {
      return { success: false, error: 'You cannot assign access to yourself.' };
    }

    const [profile, connection, teamMembershipStatus] = await Promise.all([
      getUserProfile(record.accountId),
      prisma.connection.findUnique({
        where: {
          accountId_appId: {
            accountId: record.accountId,
            appId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      }),
      getDirectTeamMembershipStatus(currentAccountId, record.accountId),
    ]);
    const displayName =
      profile?.nameDisplay ||
      (profile?.nameFirst || profile?.nameLast
        ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
        : null) ||
      normalized;

    if (!connection) {
      return {
        success: false,
        error: `${displayName} has not connected ${app.name} yet.`,
      };
    }

    if (connection.status !== 'active') {
      return {
        success: false,
        error: `${displayName} cannot be assigned access until their ${app.name} connection is active.`,
      };
    }

    return {
      success: true,
      account: {
        accountId: record.accountId,
        displayName,
        teamMembershipStatus,
      },
    };
  } catch (error) {
    await logError('database', error, `resolveNeupIdForApp:${neupId}`);
    return { success: false, error: 'Lookup failed. Please try again.' };
  }
}

// ── Assign app access to another account ─────────────────────────────────────

const assignSchema = z.object({
  appId: z.string().min(1),
  connectionId: z.string().min(1).optional(),
  memberId: z.string().min(1),
  roleIds: z.array(z.string().min(1)).min(1, 'Select at least one role.'),
});

export async function assignAppAccessToAccount(input: {
  appId: string;
  connectionId?: string;
  memberId: string;
  roleIds: string[];
  selectedAccountId?: string | null;
}): Promise<{ success: boolean; invited?: boolean; appName?: string; error?: string }> {
  const canAdd = await checkPermissions([...ACCESS_APPLICATION_ADD_PERMISSIONS]);
  if (!canAdd) return { success: false, error: 'Permission denied.' };

  const accessTo = await getActiveAccountId(input.selectedAccountId);
  if (!accessTo) return { success: false, error: 'Not authenticated.' };

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().formErrors[0] ?? 'Invalid input.' };
  }

  const { appId, memberId, roleIds } = parsed.data;
  if (memberId === accessTo) {
    return { success: false, error: 'You cannot assign access to yourself.' };
  }

  try {
    const [app, existingConnection, roles, teamMembershipStatus] = await Promise.all([
      prisma.application.findUnique({
        where: { id: appId },
        select: { id: true, name: true },
      }),
      prisma.connection.findUnique({
        where: { accountId_appId: { accountId: memberId, appId } },
        select: { id: true, status: true },
      }),
      prisma.authzRole.findMany({
        where: { appId, id: { in: roleIds } },
        select: { id: true },
      }),
      getDirectTeamMembershipStatus(accessTo, memberId),
    ]);
    if (!app) return { success: false, error: 'Application not found.' };
    if (!existingConnection) {
      return { success: false, error: 'This account has not connected this application yet.' };
    }
    if (existingConnection.status !== 'active') {
      return { success: false, error: 'This account must have an active application connection before access can be assigned.' };
    }
    if (teamMembershipStatus !== 'active') {
      return { success: false, error: 'Add this person to your team first before assigning application permissions.' };
    }
    if (roles.length !== new Set(roleIds).size) {
      return { success: false, error: 'One or more selected roles are not valid for this application.' };
    }

    await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);

      await tx.access.deleteMany({
        where: {
          memberAccountId: memberId,
          parentAccountId: accessTo,
          accessApplicationId: appId,
        },
      });

      for (const roleId of roleIds) {
        await ensureAccessGrant(tx, {
          memberAccountId: memberId,
          parentAccountId: accessTo,
          childConnectionId: existingConnection.id,
          accessApplicationId: appId,
          roleId,
          details: {
            connectionId: existingConnection.id,
          },
        });
      }
    });

    revalidatePath('/access/connection');
    if (input.connectionId) {
      revalidatePath(`/access/connection/${input.connectionId}`);
    }
    revalidatePath('/access/application');
    revalidatePath(`/access/application?application=${appId}`);
    return {
      success: true,
      invited: false,
      appName: app.name,
    };
  } catch (error) {
    await logError('database', error, `assignAppAccessToAccount:${appId}:${memberId}`);
    return { success: false, error: 'Failed to assign access.' };
  }
}

// ── Revoke app access from an account ────────────────────────────────────────

export async function revokeAppAccessFromAccount(input: {
  appId: string;
  memberId: string;
}): Promise<{ success: boolean; error?: string }> {
  const canRemove = await checkPermissions([...ACCESS_APPLICATION_REMOVE_PERMISSIONS]);
  if (!canRemove) return { success: false, error: 'Permission denied.' };

  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'Not authenticated.' };

    try {
    await prisma.$transaction(async (tx) => {
      await tx.access.deleteMany({
        where: {
          memberAccountId: input.memberId,
          parentAccountId: accessTo,
          accessApplicationId: input.appId,
        },
      });
    });

    revalidatePath('/access/connection');
    return { success: true };
  } catch (error) {
    await logError('database', error, `revokeAppAccessFromAccount:${input.appId}:${input.memberId}`);
    return { success: false, error: 'Failed to revoke access.' };
  }
}
