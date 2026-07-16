'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/services/account/verify';
import { logError } from '@/logica/logger/files';
import { canCurrentAccountManageApplicationRoles } from '@/services/applications/manage';

const BRIDGE_TYPE = 'authzWebhook';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns the registered authz webhook URL for an app, or null if not set.
 */
export async function getAuthzWebhookUrl(appId: string): Promise<string | null> {
  try {
    const record = await prisma.applicationBridge.findFirst({
      where: { appId, type: BRIDGE_TYPE },
      select: { value: true },
    });
    return record?.value ?? null;
  } catch (error) {
    await logError('database', error, `getAuthzWebhookUrl:${appId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save (upsert)
// ---------------------------------------------------------------------------

/**
 * Saves (or clears) the authz webhook URL for an app.
 * Passing an empty string removes the webhook.
 */
export async function saveAuthzWebhookUrl(input: {
  appId: string;
  url: string;
}): Promise<{ success: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const canManageRoles = await canCurrentAccountManageApplicationRoles(input.appId);
  if (!canManageRoles) return { success: false, error: 'Permission denied.' };

  const url = input.url.trim();

  // Validate URL if provided
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Webhook URL must use HTTPS.' };
      }
    } catch {
      return { success: false, error: 'Invalid webhook URL.' };
    }
  }

  try {
    if (!url) {
      // Clear the webhook
      await prisma.applicationBridge.deleteMany({
        where: { appId: input.appId, type: BRIDGE_TYPE },
      });
    } else {
      const existing = await prisma.applicationBridge.findFirst({
        where: { appId: input.appId, type: BRIDGE_TYPE },
        select: { id: true },
      });

      if (existing) {
        await prisma.applicationBridge.update({
          where: { id: existing.id },
          data: { value: url },
        });
      } else {
        await prisma.applicationBridge.create({
          data: { appId: input.appId, type: BRIDGE_TYPE, value: url },
        });
      }
    }

    revalidatePath(`/data/appconnection/${input.appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `saveAuthzWebhookUrl:${input.appId}`);
    return { success: false, error: 'Failed to save webhook URL.' };
  }
}

// ---------------------------------------------------------------------------
// Dispatch — fire-and-forget push to the registered webhook
// ---------------------------------------------------------------------------

type WebhookTable =
  | 'authz_role_permission_map'
  | 'authz_account_access_grant'
  | 'authz_assets_access_grant';

type WebhookOperation =
  | 'insert'
  | 'updateOne'
  | 'update'
  | 'deleteOne'
  | 'delete'
  | 'deleteAll';

type WebhookPayload = {
  table: WebhookTable;
  operation: WebhookOperation;
  data?: Record<string, unknown> | Record<string, unknown>[];
  id?: string | string[];
};

/**
 * Pushes an authz change to the app's registered webhook URL.
 * Silently swallows errors — webhook delivery is best-effort.
 */
export async function dispatchAuthzWebhook(
  appId: string,
  payload: WebhookPayload
): Promise<void> {
  try {
    const webhookUrl = await getAuthzWebhookUrl(appId);
    if (!webhookUrl) return;

    const secret = process.env.BRIDGE_WEBHOOK_SECRET;
    if (!secret) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-secret': secret,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    await logError('webhook', error, `dispatchAuthzWebhook:${appId}`);
  }
}
