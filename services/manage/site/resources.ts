'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';

const RESOURCE_TYPES = [
  'display_image',
  'displayImage_publicMale',
  'displayImage_publicFemale',
  'coverImage',
  'kyc_document',
] as const;

const PUBLIC_DISPLAY_RESOURCE_TYPES = new Set<string>([
  'displayImage_publicMale',
  'displayImage_publicFemale',
]);

const resourceCreateSchema = z.object({
  type: z.enum(RESOURCE_TYPES),
  accountId: z.string().uuid().optional().or(z.literal('')),
  value: z.string().trim().url('Please enter a valid resource URL.'),
  title: z.string().trim().max(120, 'Title can be at most 120 characters.').optional().or(z.literal('')),
});

const resourceTitleSchema = z.object({
  resourceId: z.string().uuid('Invalid resource id.'),
  title: z.string().trim().max(120, 'Title can be at most 120 characters.'),
});

const resourceDeleteSchema = z.object({
  resourceId: z.string().uuid('Invalid resource id.'),
});

export type ManagedResource = {
  id: string;
  type: string;
  accountId: string | null;
  uploadedBy: string;
  value: string;
  uploadedOn: string;
  title: string | null;
};

function normalizeResourceRow(row: any): ManagedResource {
  const details = row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {};
  const titleRaw = typeof details.title === 'string' ? details.title.trim() : '';

  return {
    id: row.id,
    type: row.type,
    accountId: row.accountId,
    uploadedBy: row.uploadedBy,
    value: row.value,
    uploadedOn: row.uploadedOn.toISOString(),
    title: titleRaw || null,
  };
}

export async function getResources(options?: { requirePermission?: boolean }): Promise<ManagedResource[]> {
  const requirePermission = options?.requirePermission ?? true;
  if (requirePermission) {
    const canView = await checkPermissions(['root.display_images.view']);
    if (!canView) return [];
  }

  try {
    const rows = await prisma.resource.findMany({
      orderBy: { uploadedOn: 'desc' },
      take: 500,
    });

    return rows.map(normalizeResourceRow);
  } catch (error) {
    await logError('database', error, 'getResources');
    return [];
  }
}

export async function createResource(formData: FormData): Promise<{ success: boolean; error?: string; resource?: ManagedResource }> {
  const canAdd = await checkPermissions(['root.display_images.add']);
  if (!canAdd) {
    return { success: false, error: 'Permission denied.' };
  }

  const actorId = await getPersonalAccountId();
  if (!actorId) {
    return { success: false, error: 'User not authenticated.' };
  }

  const validation = resourceCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Invalid resource input.' };
  }

  const parsed = validation.data;
  const normalizedAccountId = parsed.accountId && parsed.accountId.trim() ? parsed.accountId.trim() : null;

  if (PUBLIC_DISPLAY_RESOURCE_TYPES.has(parsed.type) && normalizedAccountId) {
    return { success: false, error: 'Public display image resources must not have accountId.' };
  }

  try {
    if (normalizedAccountId) {
      const account = await prisma.account.findUnique({ where: { id: normalizedAccountId }, select: { id: true } });
      if (!account) {
        return { success: false, error: 'Account not found.' };
      }
    }

    const row = await prisma.resource.create({
      data: {
        type: parsed.type,
        accountId: normalizedAccountId,
        uploadedBy: actorId,
        value: parsed.value.trim(),
        details: parsed.title ? { title: parsed.title.trim() } : {},
      },
    });

    revalidatePath('/config/displayImages');

    return { success: true, resource: normalizeResourceRow(row) };
  } catch (error) {
    await logError('database', error, 'createResource');
    return { success: false, error: 'Failed to create resource.' };
  }
}

export async function deleteResource(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const canDelete = await checkPermissions(['root.display_images.delete']);
  if (!canDelete) {
    return { success: false, error: 'Permission denied.' };
  }

  const validation = resourceDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Invalid resource id.' };
  }

  try {
    await prisma.resource.delete({ where: { id: validation.data.resourceId } });

    revalidatePath('/config/displayImages');
    return { success: true };
  } catch (error) {
    await logError('database', error, 'deleteResource');
    return { success: false, error: 'Failed to delete resource.' };
  }
}

export async function updateResourceTitle(formData: FormData): Promise<{ success: boolean; error?: string; resource?: ManagedResource }> {
  const canUpdate = await checkPermissions(['root.display_images.update']);
  if (!canUpdate) {
    return { success: false, error: 'Permission denied.' };
  }

  const validation = resourceTitleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Invalid input.' };
  }

  const parsed = validation.data;

  try {
    const existing = await prisma.resource.findUnique({ where: { id: parsed.resourceId } });
    if (!existing) {
      return { success: false, error: 'Resource not found.' };
    }

    const details = existing.details && typeof existing.details === 'object'
      ? { ...(existing.details as Record<string, unknown>) }
      : {};

    const normalizedTitle = parsed.title.trim();
    if (normalizedTitle) {
      details.title = normalizedTitle;
    } else {
      delete details.title;
    }

    const updated = await prisma.resource.update({
      where: { id: parsed.resourceId },
      data: { details: details as any },
    });

    revalidatePath('/config/displayImages');

    return { success: true, resource: normalizeResourceRow(updated) };
  } catch (error) {
    await logError('database', error, 'updateResourceTitle');
    return { success: false, error: 'Failed to update title.' };
  }
}

export async function logDisplayImageResourceForAccount(input: {
  accountId: string;
  uploadedBy: string;
  value: string;
  type?: string;
  title?: string;
}): Promise<void> {
  if (!input.accountId || !input.uploadedBy || !input.value) return;

  try {
    await prisma.resource.create({
      data: {
        type: input.type || 'display_image',
        accountId: input.accountId,
        uploadedBy: input.uploadedBy,
        value: input.value,
        details: input.title ? { title: input.title } : {},
      },
    });
  } catch (error) {
    await logError('database', error, `logDisplayImageResourceForAccount:${input.accountId}`);
  }
}
