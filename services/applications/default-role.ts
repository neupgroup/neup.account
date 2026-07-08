'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

export async function getApplicationDefaultRoleId(appId: string): Promise<string | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { defaultRoleId: true },
    });
    return app?.defaultRoleId ?? null;
  } catch (error) {
    await logError('database', error, `getApplicationDefaultRoleId:${appId}`);
    return null;
  }
}

