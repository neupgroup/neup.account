'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';

const manageApplicationSchema = z.object({
  appId: z.string().min(1, 'Application ID is required.'),
  permissions: z.array(z.string().min(1)).default([]),
});

export type UserApplicationAccess = {
  id: string;
  name: string;
  description: string;
  website?: string;
  connectionType: 'internal' | 'external' | 'both';
  permissions: string[];
  connectedOn: Date;
};

const INTERNAL_APP_PREFIX = 'neup.';
function isInternalApp(appId: string) {
  return appId.startsWith(INTERNAL_APP_PREFIX);
}

export async function getUserApplicationAccess(appId: string): Promise<UserApplicationAccess | null> {
  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return null;
  }

  try {
    const [application, connection, roleRows] = await Promise.all([
      prisma.application.findUnique({ where: { id: appId } }),
      prisma.connection.findUnique({
        where: {
          accountId_appId: { accountId, appId },
        },
        select: { connectedAt: true },
      }),
      prisma.member.findMany({
        where: {
          memberId: accountId,
          appId,
        },
        select: { roleId: true },
      }),
    ]);

    if (!application || !connection) {
      return null;
    }

    const connectionType: UserApplicationAccess['connectionType'] = isInternalApp(appId) ? 'internal' : 'external';
    const permissions = Array.from(new Set(roleRows.map((r) => r.roleId)));
    const connectedOn = connection.connectedAt;

    return {
      id: application.id,
      name: application.name,
      description: application.description || '',
      website: application.website || undefined,
      connectionType,
      permissions,
      connectedOn,
    };
  } catch (error) {
    await logError('database', error, `getUserApplicationAccess:${appId}`);
    return null;
  }
}

export async function addUserApplicationAccess(input: { appId: string; permissions: string[] }) {
  const parsed = manageApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application input.' };
  }

  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const { appId, permissions } = parsed.data;

  try {
    const application = await prisma.application.findUnique({ where: { id: appId }, select: { id: true } });
    if (!application) return { success: false, error: 'Application not found.' };

    await prisma.$transaction(async (tx) => {
      await tx.connection.upsert({
        where: { accountId_appId: { accountId, appId } },
        update: {},
        create: { accountId, appId, status: 'active' },
      });

      await tx.member.deleteMany({
        where: { memberId: accountId, appId },
      });

      if (permissions.length > 0) {
        await tx.member.createMany({
          data: permissions.map((roleId) => ({
            accessTo: accountId,
            memberId: accountId,
            appId,
            roleId,
          })),
          skipDuplicates: true,
        });
      }
    });

    revalidatePath('/data/appconnection');
    revalidatePath(`/data/appconnection/${appId}`);
    revalidatePath(`/data/appconnection/${appId}/edit`);

    return { success: true, appId };
  } catch (error) {
    await logError('database', error, `addUserApplicationAccess:${appId}`);
    return { success: false, error: 'Failed to add application access.' };
  }
}

export async function updateUserApplicationPermissions(input: { appId: string; permissions: string[] }) {
  const parsed = manageApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid application input.' };
  }

  const accountId = await getPersonalAccountId();
  if (!accountId) {
    return { success: false, error: 'Not signed in.' };
  }

  const { appId, permissions } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.member.deleteMany({
        where: { memberId: accountId, appId },
      });

      if (permissions.length > 0) {
        await tx.member.createMany({
          data: permissions.map((roleId) => ({
            accessTo: accountId,
            memberId: accountId,
            appId,
            roleId,
          })),
          skipDuplicates: true,
        });
      }
    });

    revalidatePath('/data/appconnection');
    revalidatePath(`/data/appconnection/${appId}`);
    revalidatePath(`/data/appconnection/${appId}/edit`);

    return { success: true, appId };
  } catch (error) {
    await logError('database', error, `updateUserApplicationPermissions:${appId}`);
    return { success: false, error: 'Failed to update permissions.' };
  }
}
