import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import { cleanupExpiredAccessModel, ensureAccessGrant, extractRolePermissionNames } from '@/services/access-model';

/*
::neup.documentation::auth-access-service
::title Auth Access Service

Shared auth-access snapshot and mutation helpers used by `/bridge/api.v1/auth/access`.

::public

This file resolves current roles and permission names for an app scope and applies access-member role grants or removals.

::public end

::private

The route file owns HTTP shape. This file owns session validation, shared access-model cleanup, and grant mutation semantics.

::private end

::end
*/

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

/*
::neup.documentation::auth-access-snapshot
::function bridgeGetAuthAccess(input)

Returns the current auth-access snapshot for an account and app.

::public

The response includes `roles`, `permissions`, `isInternal`, and timestamp metadata for the requested app scope.

::public end

::private

The implementation validates the `aid/sid/skey` triplet, defaults the app scope to `neup.account`, and reads active grants from the shared `access` table.

::private end

::end
*/
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

    await cleanupExpiredAccessModel();

    const accessRows = await prisma.access.findMany({
      where: {
        memberAccountId: aid,
        assetApplicationId: resolvedAppId,
        status: 'active',
        OR: [{ isTemporary: null }, { isTemporary: { gt: new Date() } }],
      },
      select: {
        roleId: true,
        role: {
          select: {
            permissions: true,
          },
        },
      },
    });

    const roles = Array.from(new Set(accessRows.map((row) => row.roleId)));
    const permissions = Array.from(new Set(accessRows.flatMap((row) => extractRolePermissionNames(row.role.permissions))));

    return {
      status: 200,
      body: {
        success: true,
        aid,
        appId: resolvedAppId,
        isInternal: isInternalApp(resolvedAppId),
        role: 'user',
        roles,
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

/*
::neup.documentation::auth-access-create
::function bridgeCreateAuthAccess(input)

Creates the default auth access-member grant for a recipient.

::public

This mutation is used to add a recipient into the auth access model.

::public end

::private

The function ensures the `access.member` role exists and then applies the grant through `ensureAccessGrant()` inside a transaction.

::private end

::end
*/
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
      update: { name: 'access.member', scopeFor: ['for_individual'], scopeLevel: 'assignable.byTeam', appId: 'neup.account' },
      create: { id: 'access.member', name: 'access.member', scopeFor: ['for_individual'], scopeLevel: 'assignable.byTeam', appId: 'neup.account' },
    });

    await prisma.$transaction(async (tx) => {
      await cleanupExpiredAccessModel(tx);
      await ensureAccessGrant(tx, {
        memberAccountId: recipientId,
        parentAccountId: aid,
        childApplicationId: appId,
        accessApplicationId: appId,
        roleId: 'access.member',
      });
    });

    return { status: 200, body: { success: true, message: 'Access granted.' } };
  } catch (error) {
    await logError('auth', error, 'bridge_create_auth_access');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}

/*
::neup.documentation::auth-access-update
::function bridgeUpdateAuthAccess(input)

Adds or removes app-scoped auth access roles for a recipient.

::public

Use this mutation to apply role additions or removals within the shared auth access model.

::public end

::private

The function accepts `add` and `remove`, normalizes them to arrays, and mutates the shared `access` table inside a transaction after session validation.

::private end

::end
*/
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
      await cleanupExpiredAccessModel(tx);

      if (removeRoles.length > 0) {
        await tx.access.deleteMany({
          where: {
            roleId: { in: removeRoles },
            memberAccountId: recipientId,
            parentAccountId: aid,
            assetApplicationId: appId,
          },
        });
      }

      for (const roleId of addRoles) {
        await ensureAccessGrant(tx, {
          memberAccountId: recipientId,
          parentAccountId: aid,
          childApplicationId: appId,
          accessApplicationId: appId,
          roleId,
        });
      }
    });

    return { status: 200, body: { success: true } };
  } catch (error) {
    await logError('auth', error, 'bridge_update_auth_access');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}
