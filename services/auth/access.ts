import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

const INTERNAL_APP_PREFIX = 'neup.';

function isInternalApp(appId: string) {
  return appId.startsWith(INTERNAL_APP_PREFIX);
}

async function resolveSession(input: { aid?: string | null; sid?: string | null; skey?: string | null; appId?: string | null }) {
  const { aid, sid, skey } = input;
  if (!aid || !sid || !skey) return null;

  return prisma.authnSession.findFirst({
    where: {
      id: sid,
      accountId: aid,
      key: skey,
      validTill: { gt: new Date() },
    },
  });
}

export async function bridgeGetAuthAccess(input: {
  aid?: string | null;
  sid?: string | null;
  skey?: string | null;
  appId?: string | null;
}): Promise<{ status: number; body: Record<string, any> }> {
  const { aid, appId } = input;

  if (!aid || !input.sid || !input.skey) {
    return {
      status: 400,
      body: { error: 'invalid_request', error_description: 'Missing aid, sid, or skey' },
    };
  }

  try {
    const session = await resolveSession(input);
    if (!session) {
      return {
        status: 401,
        body: { error: 'invalid_session', error_description: 'Session not found or expired' },
      };
    }

    const resolvedAppId = appId || 'neup.account';

    const roleRows = await prisma.role.findMany({
      where: {
        member: {
          memberType: 'account',
          memberAccountId: aid,
          details: {
            path: ['legacy_parent_application_id'],
            equals: resolvedAppId,
          },
        },
      },
      select: { roleId: true },
    });

    const permissions = Array.from(new Set(roleRows.map((row) => row.roleId)));

    return {
      status: 200,
      body: {
        success: true,
        aid,
        appId: resolvedAppId,
        isInternal: isInternalApp(resolvedAppId),
        role: 'user',
        teams: [],
        permissions,
        assetPermissions: [],
        resourcePermissions: [],
        accountAccess: [],
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    await logError('auth', error, 'bridge_get_auth_access');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}

export async function bridgeCreateAuthAccess(input: Record<string, any>): Promise<{ status: number; body: Record<string, any> }> {
  const { aid, sid, skey, recipientId, isPermanent, appId: appIdOverride } = input;

  if (!aid || !sid || !skey || !recipientId) {
    return { status: 400, body: { error: 'missing_parameters' } };
  }

  try {
    const session = await resolveSession({ aid, sid, skey, appId: appIdOverride || null });
    if (!session) return { status: 401, body: { error: 'unauthorized' } };

    const appId = appIdOverride || 'neup.account';

    // Ensure the access.member role exists
    await prisma.authzRole.upsert({
      where: { id: 'access.member' },
      update: { name: 'access.member', scope: 'account', appId: 'neup.account' },
      create: { id: 'access.member', name: 'access.member', scope: 'account', appId: 'neup.account' },
    });

    // Grant access directly without a portfolio
    const existing = await prisma.role.findFirst({
      where: {
        roleId: 'access.member',
        member: {
          memberType: 'account',
          memberAccountId: recipientId,
          parentType: 'account',
          parentAccountId: aid,
          details: {
            path: ['legacy_parent_application_id'],
            equals: appId,
          },
        },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.$transaction(async (tx) => {
        const member = await tx.member.create({
          data: {
            memberType: 'account',
            memberAccountId: recipientId,
            parentType: 'account',
            parentAccountId: aid,
            details: { legacy_parent_application_id: appId },
          },
          select: { id: true },
        });
        await tx.role.create({
          data: {
            memberId: member.id,
            accountId: aid,
            roleId: 'access.member',
          },
        });
      });
    }

    return { status: 200, body: { success: true, message: 'Access granted.' } };
  } catch (error) {
    await logError('auth', error, 'bridge_create_auth_access');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}

export async function bridgeUpdateAuthAccess(input: Record<string, any>): Promise<{ status: number; body: Record<string, any> }> {
  const { aid, sid, skey, add, remove, appId: appIdOverride, recipientId: targetId } = input;

  try {
    const session = await resolveSession({ aid, sid, skey, appId: appIdOverride || null });
    if (!session || !aid) return { status: 401, body: { error: 'unauthorized' } };

    const appId = appIdOverride || 'neup.account';
    const recipientId = targetId || aid;

    const addRoles = Array.isArray(add) ? add : add ? [add] : [];
    const removeRoles = Array.isArray(remove) ? remove : remove ? [remove] : [];

    await prisma.$transaction(async (tx) => {
      if (removeRoles.length > 0) {
        await tx.role.deleteMany({
          where: {
            roleId: { in: removeRoles },
            member: {
              memberType: 'account',
              memberAccountId: recipientId,
              parentType: 'account',
              parentAccountId: aid,
              details: {
                path: ['legacy_parent_application_id'],
                equals: appId,
              },
            },
          },
        });
      }

      let memberForAddRoles = await tx.member.findFirst({
        where: {
          memberType: 'account',
          memberAccountId: recipientId,
          parentType: 'account',
          parentAccountId: aid,
          details: {
            path: ['legacy_parent_application_id'],
            equals: appId,
          },
        },
        select: { id: true },
      });

      if (!memberForAddRoles) {
        memberForAddRoles = await tx.member.create({
          data: {
            memberType: 'account',
            memberAccountId: recipientId,
            parentType: 'account',
            parentAccountId: aid,
            details: { legacy_parent_application_id: appId },
          },
          select: { id: true },
        });
      }

      for (const roleId of addRoles) {
        const exists = await tx.role.findFirst({
          where: {
            roleId,
            member: {
              memberType: 'account',
              memberAccountId: recipientId,
              parentType: 'account',
              parentAccountId: aid,
              details: {
                path: ['legacy_parent_application_id'],
                equals: appId,
              },
            },
          },
          select: { id: true },
        });
        if (!exists) {
          await tx.role.create({
            data: {
              memberId: memberForAddRoles.id,
              accountId: aid,
              roleId,
            },
          });
        }
      }
    });

    return { status: 200, body: { success: true } };
  } catch (error) {
    await logError('auth', error, 'bridge_update_auth_access');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}
