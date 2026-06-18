'use server';

// Next.js form actions and page data loaders for the applications UI.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkPermissions } from '@/services/user';
import { deleteManagedApplication, getManagedApplications, updateManagedApplicationStatus } from '@/services/applications/manage';
import { getSignedApplications } from '@/services/applications/connected';
import { getPersonalAccountId } from '@/core/auth/verify';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import type { ApplicationSection, FlatAppItem } from '@/services/applications/types';

export type { FlatAppItem } from '@/services/applications/types';

const ROOT_APPLICATION_VIEW_PERMISSION = 'application.view.scopeRoot';
const ROOT_APPLICATION_EDIT_PERMISSION = 'application.edit.scopeRoot';
const ROOT_PERMISSION_SCOPE = 'individual.root';

// Aggregates managed and connected applications for the applications list page.
export async function getApplicationsPageData() {
  const managedApplications = await getManagedApplications();
  const { internal, external } = await getSignedApplications();
  const canCreateApplication = false;
  const connectedApplications = [...internal, ...external];

  const managedItems: FlatAppItem[] = managedApplications.map((app) => ({
    id: app.id,
    name: app.name,
    icon: app.icon || undefined,
    source: 'managed',
  }));

  const managedIds = new Set(managedItems.map((app) => app.id));
  const connectedItems: FlatAppItem[] = connectedApplications
    .filter((app) => !managedIds.has(app.id))
    .map((app) => ({
      id: app.id,
      name: app.name,
      icon: app.icon || undefined,
      source: 'connected',
    }));

  return {
    allApplications: [...managedItems, ...connectedItems],
    canCreateApplication,
  };
}

// Deletes an application and redirects back to the applications list.
export async function deleteManagedApplicationFromDetailsPage(
  applicationId: string,
  redirectTo: string = '/application',
  _formData?: FormData,
) {
  const result = await deleteManagedApplication(applicationId);
  if (result.success) {
    redirect(redirectTo);
  }
}

const statusOptions = ['development', 'active', 'rejected', 'blocked'] as const;
type AppStatus = (typeof statusOptions)[number];

// Updates application status from a form submission.
export async function updateManagedApplicationStatusFromForm(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const status = String(formData.get('status') || '') as AppStatus;
  if (!statusOptions.includes(status)) return;
  await updateManagedApplicationStatus({ appId, status });
}


// ---------------------------------------------------------------------------
// Segmented list page data loader
// ---------------------------------------------------------------------------

/**
 * Function getApplicationsPageDataV2.
 *
 * Returns three independent sections — Using, Development, Root — using
 * Promise.allSettled so a failure in one section does not block the others.
 */
export async function getApplicationsPageDataV2(): Promise<{
  sections: ApplicationSection[];
  canCreateApplication: boolean;
  hasPartialError: boolean;
}> {
  const personalAccountId = await getPersonalAccountId();

  if (!personalAccountId) {
    return { sections: [{ label: 'Using', apps: [] }], canCreateApplication: false, hasPartialError: false };
  }

  const [usingResult, devResult, rootResult, canCreateApplication] = await Promise.all([
    Promise.allSettled([
      prisma.connection.findMany({
        where: { accountId: personalAccountId },
        select: {
          connectedAt: true,
          application: {
            select: {
              id: true,
              name: true,
              icon: true,
              status: true,
            },
          },
        },
        orderBy: { connectedAt: 'desc' },
      }),
    ]),
    Promise.allSettled([getManagedApplications()]),
    Promise.allSettled([
      (async () => {
        const isRoot = await checkPermissions([ROOT_APPLICATION_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE });
        if (!isRoot) return null;
        return prisma.application.findMany({ orderBy: { createdAt: 'desc' } });
      })(),
    ]),
    Promise.resolve(false),
  ]);

  const sections: ApplicationSection[] = [];
  let hasPartialError = false;

  // --- Using section (always shown) ---
  const usingSettled = usingResult[0];
  if (usingSettled.status === 'fulfilled') {
    const connections = usingSettled.value;
    const apps: FlatAppItem[] = connections.map((conn) => ({
      id: conn.application.id,
      name: conn.application.name,
      icon: conn.application.icon || undefined,
      source: 'connected' as const,
      connectedAt: conn.connectedAt.toISOString(),
    }));
    sections.push({ label: 'Using', apps });
  } else {
    hasPartialError = true;
    sections.push({ label: 'Using', apps: [], error: true });
  }

  // --- Development section (only shown when user has managed apps) ---
  const devSettled = devResult[0];
  if (devSettled.status === 'fulfilled') {
    const managed = devSettled.value;
    if (managed.length > 0) {
      const apps: FlatAppItem[] = managed.map((app) => ({
        id: app.id,
        name: app.name,
        icon: app.icon || undefined,
        source: 'managed' as const,
        status: app.status,
      }));
      sections.push({ label: 'Development', apps });
    }
  } else {
    hasPartialError = true;
    sections.push({ label: 'Development', apps: [], error: true });
  }

  // --- Root section (only shown when user has the scoped root application view permission) ---
  const rootSettled = rootResult[0];
  if (rootSettled.status === 'fulfilled') {
    const allApps = rootSettled.value;
    if (allApps !== null) {
      const apps: FlatAppItem[] = allApps.map((app) => ({
        id: app.id,
        name: app.name,
        icon: app.icon || undefined,
        source: 'root' as const,
        status: app.status || undefined,
      }));
      sections.push({ label: 'Root', apps });
    }
  } else {
    hasPartialError = true;
    sections.push({ label: 'Root', apps: [], error: true });
  }

  return { sections, canCreateApplication, hasPartialError };
}

// ---------------------------------------------------------------------------
// Root application info edit
// ---------------------------------------------------------------------------

const updateApplicationInfoSchema = z.object({
  appId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(120, 'Name must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or fewer.')
    .optional()
    .or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['development', 'active', 'rejected', 'blocked'], {
    errorMap: () => ({ message: "Status must be one of: development, active, rejected, blocked." }),
  }),
});

/**
 * Function updateApplicationInfo.
 *
 * Root-only server action to update application metadata.
 * Requires the scoped root application edit permission.
 */
export async function updateApplicationInfo(
  input: z.infer<typeof updateApplicationInfoSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const canEdit = await checkPermissions([ROOT_APPLICATION_EDIT_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE });
  if (!canEdit) return { success: false, error: 'Permission denied.' };

  const parsed = updateApplicationInfoSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website, status } = parsed.data;

  try {
    await prisma.application.update({
      where: { id: appId },
      data: {
        name,
        description: description || null,
        icon: icon || null,
        website: website || null,
        status,
      },
    });

    revalidatePath('/application');
    revalidatePath(`/application/${appId}`);
    return { success: true };
  } catch (error) {
    await logError('database', error, `updateApplicationInfo:${appId}`);
    return { success: false, error: 'Failed to save application. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Connected-only loader (for /data/appconnection)
// ---------------------------------------------------------------------------

/**
 * Function getConnectedApplicationsPageData.
 *
 * Returns only the "Using" section — ApplicationConnections for the personal account.
 * Used by /data/appconnection which now shows only connected apps.
 */
export async function getConnectedApplicationsPageData(): Promise<{
  apps: FlatAppItem[];
  error: boolean;
}> {
  await requireAnyPermission404(['security.third_party.view']);
  const personalAccountId = await getPersonalAccountId();
  if (!personalAccountId) return { apps: [], error: false };

  try {
    const connections = await prisma.connection.findMany({
      where: { accountId: personalAccountId },
      select: {
        connectedAt: true,
        application: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
      orderBy: { connectedAt: 'desc' },
    });

    const apps: FlatAppItem[] = connections.map((conn) => ({
      id: conn.application.id,
      name: conn.application.name,
      icon: conn.application.icon || undefined,
      source: 'connected' as const,
      connectedAt: conn.connectedAt.toISOString(),
    }));

    return { apps, error: false };
  } catch (error) {
    await logError('database', error, 'getConnectedApplicationsPageData');
    return { apps: [], error: true };
  }
}

// ---------------------------------------------------------------------------
// Developer/Root loader (for /applications)
// ---------------------------------------------------------------------------

/**
 * Function getApplicationsManagePageData.
 *
 * Returns Development and Root sections for the /applications page.
 * Development is shown when the user has managed apps.
 * Root is shown when the user has the scoped root application view permission.
 */
export async function getApplicationsManagePageData(): Promise<{
  sections: ApplicationSection[];
  canCreateApplication: boolean;
  hasPartialError: boolean;
}> {
  const [devResult, rootResult, canCreateApplication] = await Promise.all([
    Promise.allSettled([getManagedApplications()]),
    Promise.allSettled([
      (async () => {
        const isRoot = await checkPermissions([ROOT_APPLICATION_VIEW_PERMISSION], undefined, { roleScope: ROOT_PERMISSION_SCOPE });
        if (!isRoot) return null;
        return prisma.application.findMany({ orderBy: { createdAt: 'desc' } });
      })(),
    ]),
    Promise.resolve(false),
  ]);

  const sections: ApplicationSection[] = [];
  let hasPartialError = false;

  // Development section
  const devSettled = devResult[0];
  if (devSettled.status === 'fulfilled') {
    const managed = devSettled.value;
    const apps: FlatAppItem[] = managed.map((app) => ({
      id: app.id,
      name: app.name,
      icon: app.icon || undefined,
      source: 'managed' as const,
      status: app.status,
    }));
    sections.push({ label: 'Development', apps });
  } else {
    hasPartialError = true;
    sections.push({ label: 'Development', apps: [], error: true });
  }

  // Root section
  const rootSettled = rootResult[0];
  if (rootSettled.status === 'fulfilled') {
    const allApps = rootSettled.value;
    if (allApps !== null) {
      const apps: FlatAppItem[] = allApps.map((app) => ({
        id: app.id,
        name: app.name,
        icon: app.icon || undefined,
        source: 'root' as const,
        status: app.status || undefined,
      }));
      sections.push({ label: 'Root', apps });
    }
  } else {
    hasPartialError = true;
    sections.push({ label: 'Root', apps: [], error: true });
  }

  return { sections, canCreateApplication, hasPartialError };
}
