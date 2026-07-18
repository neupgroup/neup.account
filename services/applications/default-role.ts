'use server';

import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';

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

