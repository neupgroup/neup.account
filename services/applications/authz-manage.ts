'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { dispatchAuthzWebhook } from './authz-webhook';
import { checkPermissions } from '@/services/user';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppCapability = {
  id: string;
  name: string;
  description: string | null;
  scope: string | null;
};

export type AppRole = {
  id: string;
  name: string;
  description: string | null;
  scope: string | null;
  capabilities: AppCapability[];
};

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

const ROOT_ROLE_MANAGE_PERMISSIONS = ['root.app.edit'];
const GLOBAL_AUTHZ_APP_ID = 'neup.account';

async function ensureApplicationManagementRoles(): Promise<void> {
  const capabilities = [
    { id: 'cap-appmanage-application-view', name: 'application.view', description: 'View application details and settings.' },
    { id: 'cap-appmanage-application-edit', name: 'application.edit', description: 'Edit application details, secrets, access fields, policies, and endpoints.' },
    { id: 'cap-appmanage-application-delete', name: 'application.delete', description: 'Delete or deactivate an application.' },
    { id: 'cap-appmanage-application-roles-view', name: 'application.roles.view', description: 'View application roles and capabilities.' },
    { id: 'cap-appmanage-application-roles-manage', name: 'application.roles.manage', description: 'Create, update, and delete application roles and capabilities.' },
  ] as const;

  await prisma.$transaction(async (tx) => {
    for (const cap of capabilities) {
      await tx.authzCapability.upsert({
        where: { id: cap.id },
        update: {
          name: cap.name,
          description: cap.description,
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
        create: {
          id: cap.id,
          name: cap.name,
          description: cap.description,
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
      });
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      await tx.authzRole.upsert({
        where: { id: roleId },
        update: {
          name: roleId,
          description:
            roleId === 'application.owner'
              ? 'Full ownership of an application.'
              : 'Manage application settings, roles, and capabilities.',
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
        create: {
          id: roleId,
          name: roleId,
          description:
            roleId === 'application.owner'
              ? 'Full ownership of an application.'
              : 'Manage application settings, roles, and capabilities.',
          appId: GLOBAL_AUTHZ_APP_ID,
          scope: 'application',
        },
      });
    }

    for (const roleId of ['application.owner', 'application.manage']) {
      for (const cap of capabilities) {
        const mapId = `${roleId}::${cap.id}`;
        await tx.authzRoleCapability.upsert({
          where: { id: mapId },
          update: {
            roleId,
            capabilityId: cap.id,
            appId: GLOBAL_AUTHZ_APP_ID,
            roleName: roleId,
            denormalizedCapability: [cap.name],
          },
          create: {
            id: mapId,
            roleId,
            capabilityId: cap.id,
            appId: GLOBAL_AUTHZ_APP_ID,
            roleName: roleId,
            denormalizedCapability: [cap.name],
          },
        });
      }
    }
  });
}

async function assertCanManageAuthz(appId: string): Promise<{ accountId: string } | { error: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { error: 'Not signed in.' };

  // Ensure management roles/capabilities are always present in authz tables.
  await ensureApplicationManagementRoles();

  // Root override: global root app editors can manage app roles/capabilities.
  const isRootManager = await checkPermissions(ROOT_ROLE_MANAGE_PERMISSIONS, accountId);
  if (isRootManager) return { accountId };

  const grant = await prisma.authzAccountAccessGrant.findFirst({
    where: {
      targetAccountId: accountId,
      appId,
      roleId: { in: ['application.owner', 'application.manage', 'application.edit', 'app.manage', 'app.edit'] },
    },
    select: { id: true },
  });

  if (!grant) return { error: 'Permission denied.' };
  return { accountId };
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export async function getAppCapabilities(appId: string): Promise<AppCapability[]> {
  try {
    const records = await prisma.authzCapability.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, scope: true },
    });
    return records;
  } catch (error) {
    await logError('database', error, `getAppCapabilities:${appId}`);
    return [];
  }
}

export async function createAppCapability(input: {
  appId: string;
  name: string;
  description?: string;
  scope?: string;
}): Promise<{ success: boolean; capability?: AppCapability; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Capability name is required.' };
  if (!/^[a-z0-9._-]+$/.test(name)) {
    return { success: false, error: 'Capability name may only contain lowercase letters, numbers, dots (.), underscores (_), and hyphens (-).' };
  }

  try {
    const record = await prisma.authzCapability.create({
      data: {
        name,
        description: input.description?.trim() || null,
        scope: input.scope?.trim() || null,
        appId: input.appId,
      },
      select: { id: true, name: true, description: true, scope: true },
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, capability: record };
  } catch (error) {
    await logError('database', error, `createAppCapability:${input.appId}`);
    return { success: false, error: 'Failed to create capability.' };
  }
}

export async function updateAppCapability(input: {
  appId: string;
  capabilityId: string;
  name: string;
  description?: string;
  scope?: string;
}): Promise<{ success: boolean; capability?: AppCapability; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Capability name is required.' };
  if (!/^[a-z0-9._-]+$/.test(name)) {
    return { success: false, error: 'Capability name may only contain lowercase letters, numbers, dots (.), underscores (_), and hyphens (-).' };
  }

  try {
    const record = await prisma.authzCapability.update({
      where: { id: input.capabilityId },
      data: {
        name,
        description: input.description?.trim() || null,
        scope: input.scope?.trim() || null,
      },
      select: { id: true, name: true, description: true, scope: true },
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, capability: record };
  } catch (error) {
    await logError('database', error, `updateAppCapability:${input.appId}`);
    return { success: false, error: 'Failed to update capability.' };
  }
}

export async function deleteAppCapability(input: {
  appId: string;
  capabilityId: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.authzCapability.delete({ where: { id: input.capabilityId } });
    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteAppCapability:${input.appId}`);
    return { success: false, error: 'Failed to delete capability.' };
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function getAppRoles(appId: string): Promise<AppRole[]> {
  try {
    const roles = await prisma.authzRole.findMany({
      where: { appId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
        roleMaps: {
          select: {
            capability: {
              select: { id: true, name: true, description: true, scope: true },
            },
          },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,
      capabilities: role.roleMaps.map((m) => m.capability),
    }));
  } catch (error) {
    await logError('database', error, `getAppRoles:${appId}`);
    return [];
  }
}

export async function createAppRole(input: {
  appId: string;
  name: string;
  description?: string;
  scope?: string;
  capabilityIds: string[];
}): Promise<{ success: boolean; role?: AppRole; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Role name is required.' };
  if (!/^[a-z0-9._]+$/.test(name)) {
    return { success: false, error: 'Role name may only contain lowercase letters, numbers, dots (.) and underscores (_).' };
  }

  // Enforce uniqueness: one role per name per app
  const existing = await prisma.authzRole.findFirst({
    where: { name, appId: input.appId },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: `A role named "${name}" already exists for this application.` };
  }

  try {
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.authzRole.create({
        data: {
          name,
          description: input.description?.trim() || null,
          scope: input.scope?.trim() || null,
          appId: input.appId,
        },
        select: { id: true, name: true, description: true, scope: true },
      });

      if (input.capabilityIds.length > 0) {
        const caps = await tx.authzCapability.findMany({
          where: { id: { in: input.capabilityIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await tx.authzRoleCapability.createMany({
          data: caps.map((cap) => ({
            roleId: created.id,
            capabilityId: cap.id,
            appId: input.appId,
            roleName: name,
            denormalizedCapability: [cap.name],
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // Dispatch webhook
    const fullRole = await getAppRoles(input.appId).then((roles) =>
      roles.find((r) => r.id === role.id) ?? { ...role, capabilities: [] }
    );

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true, role: fullRole };
  } catch (error) {
    await logError('database', error, `createAppRole:${input.appId}`);
    return { success: false, error: 'Failed to create role.' };
  }
}

export async function updateAppRoleCapabilities(input: {
  appId: string;
  roleId: string;
  capabilityIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.authzRole.findFirst({
        where: { id: input.roleId, appId: input.appId },
        select: { id: true, name: true },
      });
      if (!role) throw new Error('Role not found.');

      await tx.authzRoleCapability.deleteMany({ where: { roleId: input.roleId } });

      if (input.capabilityIds.length > 0) {
        const caps = await tx.authzCapability.findMany({
          where: { id: { in: input.capabilityIds }, appId: input.appId },
          select: { id: true, name: true },
        });

        await tx.authzRoleCapability.createMany({
          data: caps.map((cap) => ({
            roleId: input.roleId,
            capabilityId: cap.id,
            appId: input.appId,
            roleName: role.name,
            denormalizedCapability: [cap.name],
          })),
          skipDuplicates: true,
        });
      }
    });

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateAppRoleCapabilities:${input.appId}`);
    return { success: false, error: 'Failed to update role capabilities.' };
  }
}

export async function deleteAppRole(input: {
  appId: string;
  roleId: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageAuthz(input.appId);
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    await prisma.authzRole.delete({ where: { id: input.roleId } });
    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `deleteAppRole:${input.appId}`);
    return { success: false, error: 'Failed to delete role.' };
  }
}

// ---------------------------------------------------------------------------
// Push all roles + capabilities to the registered webhook
// ---------------------------------------------------------------------------

export async function pushAuthzToWebhook(appId: string): Promise<{
  success: boolean;
  pushed: number;
  error?: string;
}> {
  const auth = await assertCanManageAuthz(appId);
  if ('error' in auth) return { success: false, pushed: 0, error: auth.error };

  try {
    const roleMaps = await prisma.authzRoleCapability.findMany({
      where: { appId },
      select: {
        id: true,
        roleId: true,
        capabilityId: true,
        scope: true,
        denormalizedCapability: true,
        roleName: true,
      },
    });

    if (roleMaps.length === 0) {
      return { success: true, pushed: 0 };
    }

    // Push each role-capability mapping as an insert
    for (const map of roleMaps) {
      await dispatchAuthzWebhook(appId, {
        table: 'authz_role_capability',
        operation: 'insert',
        data: {
          roleId: map.roleId,
          capabilityId: map.capabilityId,
          scope: map.scope,
          denormalizedCapability: map.denormalizedCapability,
          roleName: map.roleName,
        },
      });
    }

    return { success: true, pushed: roleMaps.length };
  } catch (error) {
    await logError('webhook', error, `pushAuthzToWebhook:${appId}`);
    return { success: false, pushed: 0, error: 'Failed to push data.' };
  }
}

// ---------------------------------------------------------------------------
// Clear push status (roles + app access grants)
// ---------------------------------------------------------------------------

export async function clearAuthzPushStatus(appId: string): Promise<{
  success: boolean;
  cleared: { roles: number; access: number };
  error?: string;
}> {
  const auth = await assertCanManageAuthz(appId);
  if ('error' in auth) return { success: false, cleared: { roles: 0, access: 0 }, error: auth.error };

  try {
    const [rolesResult, accessResult] = await prisma.$transaction([
      prisma.authzRole.updateMany({ where: { appId }, data: { pushed: false } }),
      prisma.authzAppAccessGrant.updateMany({ where: { appId }, data: { pushed: false } }),
    ]);

    revalidatePath(`/application/${appId}/roles`);
    revalidatePath(`/data/appconnection/${appId}`);

    return { success: true, cleared: { roles: rolesResult.count, access: accessResult.count } };
  } catch (error) {
    await logError('database', error, `clearAuthzPushStatus:${appId}`);
    return { success: false, cleared: { roles: 0, access: 0 }, error: 'Failed to clear push status.' };
  }
}
