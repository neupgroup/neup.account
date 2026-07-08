'use server';

import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

export type ResolvedAsset = {
  name: string;
  subtitle?: string;
};

// ── Per-type resolvers ────────────────────────────────────────────────────────

/**
 * Resolves an application asset by its application ID.
 */
async function resolveApplicationAsset(assetId: string): Promise<ResolvedAsset | null> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: assetId },
      select: { name: true, status: true },
    });
    if (!app) return null;
    return {
      name: app.name,
      subtitle: app.status ?? undefined,
    };
  } catch (error) {
    await logError('database', error, `resolveApplicationAsset:${assetId}`);
    return null;
  }
}

/**
 * Resolves an account asset (individual, brand, subbrand, dependent) by account ID.
 */
async function resolveAccountAsset(assetId: string, assetType: string): Promise<ResolvedAsset | null> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: assetId },
      select: {
        displayName: true,
        accountType: true,
        neupIds: { where: { isPrimary: true }, select: { neupId: true }, take: 1 },
      },
    });
    if (!account) return null;
    return {
      name: account.displayName ?? assetId,
      subtitle: assetType,
    };
  } catch (error) {
    await logError('database', error, `resolveAccountAsset:${assetId}`);
    return null;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const APPLICATION_TYPES = new Set(['app_in_acc', 'application', 'app']);
const ACCOUNT_TYPES = new Set([
  'acc_in_acc',
  'account.individual',
  'account.brand',
  'account.branch',
  'account.subbrand',
  'account.dependent',
  'brand_account',
  'branch_account',
  'subbrand_account',
]);
const CONNECTION_TYPES = new Set(['conn_in_acc', 'connection']);

/**
 * Resolves a human-readable name for any asset.
 * Falls back to the raw assetId if no resolver matches or the entity is not found.
 */
export async function resolveAssetName(
  assetId: string,
  assetType: string,
): Promise<ResolvedAsset> {
  const type = assetType.trim().toLowerCase();

  if (APPLICATION_TYPES.has(type)) {
    const result = await resolveApplicationAsset(assetId);
    if (result) return result;
  }

  if (ACCOUNT_TYPES.has(type)) {
    const result = await resolveAccountAsset(assetId, assetType);
    if (result) return result;
  }

  if (CONNECTION_TYPES.has(type)) {
    const result = await prisma.connection.findUnique({
      where: { id: assetId },
      select: { application: { select: { name: true } }, status: true },
    }).then((connection) => {
      if (!connection) return null;
      return {
        name: connection.application.name,
        subtitle: connection.status,
      } satisfies ResolvedAsset;
    }).catch(async (error) => {
      await logError('database', error, `resolveConnectionAsset:${assetId}`);
      return null;
    });

    if (result) return result;
  }

  // Fallback — unknown type or entity not found
  return { name: assetId, subtitle: assetType };
}

/**
 * Resolves names for a list of assets in parallel.
 * Returns a map keyed by asset.id → ResolvedAsset.
 */
export async function resolveAssetNames(
  assets: Array<{ id: string; assetId: string; assetType: string }>,
): Promise<Record<string, ResolvedAsset>> {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const resolved = await resolveAssetName(asset.assetId, asset.assetType);
      return [asset.id, resolved] as const;
    }),
  );
  return Object.fromEntries(entries);
}
