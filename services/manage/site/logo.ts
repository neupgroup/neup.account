'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData, writeSystemConfigData } from '@/services/manage/site/system-config';

const DEFAULT_SITE_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';
const CDN_BASE_URL = 'https://neupcdn.com';

function resolveLogoUrl(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_SITE_LOGO_URL;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${CDN_BASE_URL}${normalizedPath}`;
}

const siteLogoSchema = z.object({
  siteLogoUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
});

/**
 * Returns the resolved configured site logo URL, if it exists.
 * Does not apply default fallback.
 */
export async function getConfiguredSiteLogoUrl(): Promise<string | undefined> {
  try {
    const data = await readSystemConfigData<{ siteLogoUrl?: string }>(
      SYSTEM_CONFIG_KEYS.siteLogo,
      {},
    );
    if (!data || typeof data !== 'object') return undefined;
    if (!data.siteLogoUrl) return undefined;
    return resolveLogoUrl(data.siteLogoUrl);
  } catch (error) {
    await logError('database', error, 'getConfiguredSiteLogoUrl');
    return undefined;
  }
}

/**
 * Returns site logo URL with default fallback.
 */
export async function getSiteLogoUrl(): Promise<string> {
  const configured = await getConfiguredSiteLogoUrl();
  return configured || DEFAULT_SITE_LOGO_URL;
}


/**
 * Function updateSiteLogoUrl.
 */
export async function updateSiteLogoUrl(
  formData: FormData,
): Promise<{ success: boolean; error?: string; siteLogoUrl?: string }> {
  const canEdit = await checkPermissions(['root.payment_config.view']);
  if (!canEdit) {
    return { success: false, error: 'Permission denied.' };
  }

  const validation = siteLogoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message || 'Invalid logo URL.';
    return { success: false, error: firstError };
  }

  const resolvedSiteLogoUrl = resolveLogoUrl(validation.data.siteLogoUrl);

  try {
    const success = await writeSystemConfigData(SYSTEM_CONFIG_KEYS.siteLogo, {
      siteLogoUrl: resolvedSiteLogoUrl,
    });

    if (!success) {
      return { success: false, error: 'Failed to save logo.' };
    }

    revalidatePath('/manage/config');
    revalidatePath('/config');
    revalidatePath('/config/app');
    revalidatePath('/');

    return { success: true, siteLogoUrl: resolvedSiteLogoUrl };
  } catch (error) {
    await logError('database', error, 'updateSiteLogoUrl');
    return { success: false, error: 'Failed to save logo.' };
  }
}
