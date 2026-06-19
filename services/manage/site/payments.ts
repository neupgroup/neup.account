'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
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


/**
 * Function getPaymentSettings.
 */
export async function getPaymentSettings(options?: { requirePermission?: boolean }): Promise<PaymentSettings> {
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
