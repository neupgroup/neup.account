'use server';

import { permission } from '@/logica/permission';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import prisma from '@/core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';

const servicePermissions = [
  permission('root.display_images.view', 'for_individual', 'service'),
  permission('root.display_images.add', 'for_individual', 'service'),
  permission('root.display_images.delete', 'for_individual', 'service'),
  permission('root.display_images.update', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-site-resources-module
 * ::title Managed Resource Service
 *
 * Reads and manages uploaded resource records such as display images and KYC documents.
 *
 * ::public
 *
 * Use this service to list, create, delete, and retitle managed resources used by the account app.
 *
 * ::public end
 *
 * ::private
 *
 * Resource writes are permission-gated and revalidate the display-image config routes after successful mutations.
 *
 * ::private end
 *
 * ::end
 */
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
  /**
   * ::neup.documentation::manage-site-resources-get-resources
   * ::function getResources(options)
   *
   * Returns the managed resource list.
   *
   * ::public
   *
   * Callers can optionally skip the permission gate by passing `requirePermission: false`.
   *
   * ::public end
   *
   * ::private
   *
   * Results are normalized from raw `resource` rows into a stable serializable shape.
   *
   * ::private end
   *
   * ::end
   */
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
  /**
   * ::neup.documentation::manage-site-resources-create-resource
   * ::function createResource(formData)
   *
   * Creates a new managed resource record.
   *
   * ::public
   *
   * The form accepts a resource type, URL value, optional account ID, and optional title.
   *
   * ::public end
   *
   * ::private
   *
   * Public display-image resource types cannot be attached to a specific account.
   *
   * ::private end
   *
   * ::end
   */
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
    revalidatePath('/site/config/displayImages');

    return { success: true, resource: normalizeResourceRow(row) };
  } catch (error) {
    await logError('database', error, 'createResource');
    return { success: false, error: 'Failed to create resource.' };
  }
}

export async function deleteResource(formData: FormData): Promise<{ success: boolean; error?: string }> {
  /**
   * ::neup.documentation::manage-site-resources-delete-resource
   * ::function deleteResource(formData)
   *
   * Deletes a managed resource by ID.
   *
   * ::public
   *
   * Use this helper when a resource should be removed entirely from the resource library.
   *
   * ::public end
   *
   * ::private
   *
   * Successful deletes revalidate the display-image config routes.
   *
   * ::private end
   *
   * ::end
   */
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
    revalidatePath('/site/config/displayImages');
    return { success: true };
  } catch (error) {
    await logError('database', error, 'deleteResource');
    return { success: false, error: 'Failed to delete resource.' };
  }
}

export async function updateResourceTitle(formData: FormData): Promise<{ success: boolean; error?: string; resource?: ManagedResource }> {
  /**
   * ::neup.documentation::manage-site-resources-update-resource-title
   * ::function updateResourceTitle(formData)
   *
   * Updates the stored title metadata for a managed resource.
   *
   * ::public
   *
   * Use this when the resource library UI needs to label or relabel an uploaded item.
   *
   * ::public end
   *
   * ::private
   *
   * Title data is stored inside the resource `details` object rather than a top-level column.
   *
   * ::private end
   *
   * ::end
   */
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
    revalidatePath('/site/config/displayImages');

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
  /**
   * ::neup.documentation::manage-site-resources-log-display-image
   * ::function logDisplayImageResourceForAccount(input)
   *
   * Logs a display-image resource record for an account without enforcing manage-surface permissions.
   *
   * ::public
   *
   * This helper is used by profile-update flows to preserve a resource history for uploaded display images.
   *
   * ::public end
   *
   * ::private
   *
   * Errors are logged and suppressed so profile updates do not fail solely because the resource history write failed.
   *
   * ::private end
   *
   * ::end
   */
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
