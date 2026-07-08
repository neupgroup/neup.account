'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { permission } from '@/logica/permission';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData, writeSystemConfigData } from '@/services/manage/site/system-config';

const optionalText = z
  .string()
  .trim()
  .max(300, 'Value is too long.')
  .optional()
  .or(z.literal(''))
  .transform((value) => (value ? value : undefined));

const paymentSettingsSchema = z.object({
  providerName: optionalText,
  accountName: optionalText,
  accountNumber: optionalText,
  ifscCode: optionalText,
  upiId: optionalText,
  qrCodeUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || /^https?:\/\//.test(value), {
      message: 'QR Code URL must start with http:// or https://',
    }),
  notes: z
    .string()
    .trim()
    .max(1200, 'Notes can be at most 1200 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
});

/**
 * Type PaymentSettings.
 */
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

const defaultPaymentSettings: PaymentSettings = {
  providerName: undefined,
  accountName: undefined,
  accountNumber: undefined,
  ifscCode: undefined,
  upiId: undefined,
  qrCodeUrl: undefined,
  notes: undefined,
};

const servicePermissions = [
  permission('root.payment_config.view', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-site-payments-module
 * ::title Site Payment Settings Service
 *
 * Reads and updates the configurable payment instructions used by account surfaces.
 *
 * ::public
 *
 * Use this service to load the configured payment provider details, QR code URL, and notes shown to users.
 *
 * ::public end
 *
 * ::private
 *
 * Settings are stored in system config and validated through the Zod schema before being returned or persisted.
 *
 * ::private end
 *
 * ::end
 */

/**
 * Function getPaymentSettings.
 */
export async function getPaymentSettings(options?: { requirePermission?: boolean }): Promise<PaymentSettings> {
  /**
   * ::neup.documentation::manage-site-payments-get-settings
   * ::function getPaymentSettings(options)
   *
   * Returns the configured payment settings.
   *
   * ::public
   *
   * Callers can optionally skip the permission gate by passing `requirePermission: false`.
   *
   * ::public end
   *
   * ::private
   *
   * Invalid stored config falls back to the empty default settings object.
   *
   * ::private end
   *
   * ::end
   */
  const requirePermission = options?.requirePermission ?? true;
  if (requirePermission) {
    const canView = await checkPermissions(['root.payment_config.view']);
    if (!canView) return defaultPaymentSettings;
  }

  try {
    const data = await readSystemConfigData(SYSTEM_CONFIG_KEYS.payments, defaultPaymentSettings);
    const parsed = paymentSettingsSchema.safeParse(data);
    if (!parsed.success) {
      return defaultPaymentSettings;
    }

    return parsed.data;
  } catch (error) {
    await logError('database', error, 'getPaymentSettings');
    return defaultPaymentSettings;
  }
}


/**
 * Function updatePaymentSettings.
 */
export async function updatePaymentSettings(
  formData: FormData,
): Promise<{ success: boolean; error?: string; data?: PaymentSettings }> {
  /**
   * ::neup.documentation::manage-site-payments-update-settings
   * ::function updatePaymentSettings(formData)
   *
   * Persists updated payment settings from manage-site form input.
   *
   * ::public
   *
   * The form can update provider details, account details, UPI, QR code URL, and freeform payment notes.
   *
   * ::public end
   *
   * ::private
   *
   * Successful writes revalidate the config and payment routes that consume these settings.
   *
   * ::private end
   *
   * ::end
   */
  const canEdit = await checkPermissions(['root.payment_config.view']);
  if (!canEdit) {
    return { success: false, error: 'Permission denied.' };
  }

  const validation = paymentSettingsSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message || 'Invalid payment settings.';
    return { success: false, error: firstError };
  }

  try {
    const paymentWrite = await writeSystemConfigData(SYSTEM_CONFIG_KEYS.payments, validation.data);
    if (!paymentWrite) {
      return { success: false, error: 'Failed to save payment settings.' };
    }

    revalidatePath('/manage/config');
    revalidatePath('/config');
    revalidatePath('/config/payments');
    revalidatePath('/site/config');
    revalidatePath('/site/config/payments');
    revalidatePath('/payment/neup.pro');

    return {
      success: true,
      data: validation.data,
    };
  } catch (error) {
    await logError('database', error, 'updatePaymentSettings');
    return { success: false, error: 'Failed to save payment settings.' };
  }
}
