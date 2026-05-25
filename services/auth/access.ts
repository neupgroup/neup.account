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

    const roleRows = await prisma.member.findMany({
      where: {
        memberId: aid,
        parentApplicationId: resolvedAppId,
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
    const existing = await prisma.member.findFirst({
      where: {
        accessTo: aid,
        memberId: recipientId,
        accessFor: 'application',
        parentApplicationId: appId,
        roleId: 'access.member',
      },
    });

    if (!existing) {
      await prisma.member.create({
        data: {
          accessTo: aid,
          memberId: recipientId,
          accessFor: 'application',
          parentApplicationId: appId,
          roleId: 'access.member',
        },
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
        await tx.member.deleteMany({
          where: {
            memberId: recipientId,
            parentApplicationId: appId,
            roleId: { in: removeRoles },
          },
        });
      }

      for (const roleId of addRoles) {
        const exists = await tx.member.findFirst({
          where: { accessTo: aid, memberId: recipientId, parentApplicationId: appId, roleId },
        });
        if (!exists) {
          await tx.member.create({
            data: {
              accessTo: aid,
              memberId: recipientId,
              accessFor: 'application',
              parentApplicationId: appId,
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
