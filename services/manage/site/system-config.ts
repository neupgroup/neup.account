import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

export const SYSTEM_CONFIG_KEYS = {
  socials: 'socials',
  payments: 'payments',
  siteLogo: 'siteLogo',
} as const;

export async function readSystemConfigData<T>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    if (!row || !row.data || typeof row.data !== 'object') {
      return fallback;
    }

    return row.data as T;
  } catch (error) {
    await logError('database', error, `readSystemConfigData:${key}`);
    return fallback;
  }
}

export async function writeSystemConfigData<T>(
  key: string,
  data: T,
): Promise<boolean> {
  try {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { data: data as any },
      create: {
        key,
        data: data as any,
      },
    });

    return true;
  } catch (error) {
    await logError('database', error, `writeSystemConfigData:${key}`);
    return false;
  }
}
