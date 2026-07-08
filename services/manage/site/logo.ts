'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { permission } from '@/neup.logica/permission';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData, writeSystemConfigData } from '@/services/manage/site/system-config';

const DEFAULT_SITE_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';
const CDN_BASE_URL = 'https://neupcdn.com';

/**
 * ::neup.documentation::manage-site-logo-module
 * ::title Site Logo Management Service
 *
 * Reads and updates the configurable site logo URL.
 *
 * ::public
 *
 * Use this service to resolve the saved logo URL, apply the default fallback logo, or persist a new configured logo.
 *
 * ::public end
 *
 * ::private
 *
 * Relative paths are normalized against the Neup CDN base URL and the saved value is stored in system config.
 *
 * ::private end
 *
 * ::end
 */
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

const servicePermissions = [
  permission('root.payment_config.view', 'for_individual', 'service'),
];

/**
 * Returns the resolved configured site logo URL, if it exists.
 * Does not apply default fallback.
 */
export async function getConfiguredSiteLogoUrl(): Promise<string | undefined> {
  /**
   * ::neup.documentation::manage-site-logo-get-configured
   * ::function getConfiguredSiteLogoUrl()
   *
   * Returns the configured site logo URL without applying the default fallback.
   *
   * ::public
   *
   * This helper returns `undefined` when no logo has been configured or when the config payload is invalid.
   *
   * ::public end
   *
   * ::private
   *
   * Read errors are logged and suppressed so branding reads do not break page rendering.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::manage-site-logo-get-defaulted
   * ::function getSiteLogoUrl()
   *
   * Returns the effective site logo URL with the default fallback applied.
   *
   * ::public
   *
   * Use this when callers always need a usable logo URL, even if no custom config exists.
   *
   * ::public end
   *
   * ::private
   *
   * The fallback is the static Neup Account logo asset.
   *
   * ::private end
   *
   * ::end
   */
  const configured = await getConfiguredSiteLogoUrl();
  return configured || DEFAULT_SITE_LOGO_URL;
}


/**
 * Function updateSiteLogoUrl.
 */
export async function updateSiteLogoUrl(
  formData: FormData,
): Promise<{ success: boolean; error?: string; siteLogoUrl?: string }> {
  /**
   * ::neup.documentation::manage-site-logo-update
   * ::function updateSiteLogoUrl(formData)
   *
   * Persists a new configured site logo URL from manage-site form input.
   *
   * ::public
   *
   * The submitted `siteLogoUrl` may be absolute, protocol-relative, or path-like; it is normalized before storage.
   *
   * ::public end
   *
   * ::private
   *
   * This action currently gates writes behind `root.payment_config.view`, updates system config, and revalidates the relevant config routes.
   *
   * ::private end
   *
   * ::end
   */
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
    revalidatePath('/site/config');
    revalidatePath('/site/config/app');
    revalidatePath('/');

    return { success: true, siteLogoUrl: resolvedSiteLogoUrl };
  } catch (error) {
    await logError('database', error, 'updateSiteLogoUrl');
    return { success: false, error: 'Failed to save logo.' };
  }
}
