'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { getUserProfile } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';

// ── Types ─────────────────────────────────────────────────────────────────────

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

export type ResolvedAccount = {
  accountId: string;
  displayName: string;
};

type ApplicationAccessPageOptions = {
  ownerOnly?: boolean;
};

// ── Fetch page data ───────────────────────────────────────────────────────────

export async function getApplicationAccessPageData(
  options?: ApplicationAccessPageOptions,
): Promise<AppWithAccess[]> {
  const personalAccountId = await getPersonalAccountId();
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
        const myGrants = await prisma.member.findMany({
          where: {
            memberAccountId: personalAccountId,
            roles: {
              some: {
                connection: { appId: app.id },
              },
            },
          },
          select: {
            roles: {
              where: { connection: { appId: app.id } },
              select: { roleId: true },
            },
          },
        });

        // Grants the current user has issued to others on this app
        // (accessTo = current user, memberId != current user)
        const outboundGrants = await prisma.member.findMany({
          where: {
            parentAccountId: personalAccountId,
            parentType: 'account',
            memberType: 'account',
            NOT: { memberAccountId: personalAccountId },
            roles: {
              some: {
                connection: { appId: app.id },
              },
            },
          },
          select: {
            memberAccountId: true,
            roles: {
              where: { connection: { appId: app.id } },
              select: { roleId: true },
            },
          },
        });

        // Group outbound grants by target account
        const granteeMap = new Map<string, string[]>();
        for (const g of outboundGrants) {
          if (!g.memberAccountId) continue;
          if (!granteeMap.has(g.memberAccountId)) granteeMap.set(g.memberAccountId, []);
          for (const role of g.roles) granteeMap.get(g.memberAccountId)!.push(role.roleId);
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

        const myRoleRows = myGrants.flatMap((g) => g.roles);
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

// ── Resolve NeupID ────────────────────────────────────────────────────────────

export async function resolveNeupIdForApp(
  neupId: string,
): Promise<{ success: true; account: ResolvedAccount } | { success: false; error: string }> {
  const normalized = neupId.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return { success: false, error: 'NeupID must be at least 3 characters.' };
  }

  try {
    const record = await prisma.neupId.findUnique({
      where: { id: normalized },
      select: { accountId: true },
    });

    if (!record) return { success: false, error: 'No account found with that NeupID.' };

    const profile = await getUserProfile(record.accountId);
    const displayName =
      profile?.nameDisplay ||
      (profile?.nameFirst || profile?.nameLast
        ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
        : null) ||
      normalized;

    return { success: true, account: { accountId: record.accountId, displayName } };
  } catch (error) {
    await logError('database', error, `resolveNeupIdForApp:${neupId}`);
    return { success: false, error: 'Lookup failed. Please try again.' };
  }
}

// ── Assign app access to another account ─────────────────────────────────────

const assignSchema = z.object({
  appId: z.string().min(1),
  memberId: z.string().min(1),
  roleIds: z.array(z.string().min(1)).min(1, 'Select at least one role.'),
});

export async function assignAppAccessToAccount(input: {
  appId: string;
  memberId: string;
  roleIds: string[];
}): Promise<{ success: boolean; invited?: boolean; appName?: string; error?: string }> {
  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'Not authenticated.' };

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().formErrors[0] ?? 'Invalid input.' };
  }

  const { appId, memberId, roleIds } = parsed.data;

  try {
    // Verify the app exists
    const app = await prisma.application.findUnique({ where: { id: appId }, select: { id: true, name: true } });
    if (!app) return { success: false, error: 'Application not found.' };

    // Check if the target already has an active connection to this app.
    // If not, create one with status 'inactive_invited' — they've been granted
    // access but haven't connected to the app themselves yet.
    const existingConnection = await prisma.connection.findUnique({
      where: { accountId_appId: { accountId: memberId, appId } },
      select: { id: true, status: true },
    });

    if (!existingConnection) {
      const defaultRoleId = await getApplicationDefaultRoleId(appId);
      await prisma.connection.create({
        data: { accountId: memberId, appId, status: 'inactive_invited', roleId: defaultRoleId },
      });
    }
    // If a connection already exists, leave its status untouched.

    // Remove existing grants from this owner to this target on this app, then re-create
    await prisma.$transaction(async (tx) => {
      const targetConnection = await tx.connection.findUnique({
        where: { accountId_appId: { accountId: memberId, appId } },
        select: { id: true },
      });
      if (!targetConnection) {
        throw new Error('Target connection not found after ensure step.');
      }

      const existingMemberRows = await tx.member.findMany({
        where: {
          memberType: 'account',
          memberAccountId: memberId,
          parentType: 'account',
          parentAccountId: accessTo,
          roles: { some: { connection: { appId } } },
        },
        select: { id: true },
      });

      await tx.member.deleteMany({
        where: { id: { in: existingMemberRows.map((m) => m.id) } },
      });

      const member = await tx.member.create({
        data: {
          memberType: 'account',
          memberAccountId: memberId,
          parentType: 'account',
          parentAccountId: accessTo,
          details: {
            legacy_parent_application_id: appId,
          },
        },
        select: { id: true },
      });

      await tx.role.createMany({
        data: roleIds.map((roleId) => ({
          memberId: member.id,
          connectionId: targetConnection.id,
          roleId,
        })),
        skipDuplicates: true,
      });
    });

    revalidatePath('/access/connection');
    // Let the caller know if this was a fresh invite (no prior connection)
    // so the UI can show the "user doesn't have an account on <app> yet" notice.
    return {
      success: true,
      invited: !existingConnection,
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
  const accessTo = await getActiveAccountId();
  if (!accessTo) return { success: false, error: 'Not authenticated.' };

  try {
    await prisma.$transaction(async (tx) => {
      const existingMemberRows = await tx.member.findMany({
        where: {
          memberType: 'account',
          memberAccountId: input.memberId,
          parentType: 'account',
          parentAccountId: accessTo,
          roles: { some: { connection: { appId: input.appId } } },
        },
        select: { id: true },
      });

      await tx.member.deleteMany({
        where: { id: { in: existingMemberRows.map((m) => m.id) } },
      });
    });

    revalidatePath('/access/connection');
    return { success: true };
  } catch (error) {
    await logError('database', error, `revokeAppAccessFromAccount:${input.appId}:${input.memberId}`);
    return { success: false, error: 'Failed to revoke access.' };
  }
}
