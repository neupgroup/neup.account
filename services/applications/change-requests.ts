'use server';

// Handles application change requests — when an owner submits edits, they are
// stored as a pending Request rather than applied immediately. A root admin
// must approve before the application table is updated.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/neup.core/helpers/prisma';
import { Prisma } from '@/prisma/generated/client';
import { getActiveAccountId } from '@/neup.core/auth/verify';
import { checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/neup.core/helpers/logger';
import { canCurrentAccountEditApplicationBasics } from '@/services/applications/manage';
import { revalidateApplicationDetailRoutes, revalidateApplicationEditRoutes } from '@/services/applications/revalidate-routes';
import { permission } from '@/neup.logica/permission';

const servicePermissions = [
  permission('requests.root_approval.view', 'for_individual', 'service'),
  permission('requests.root_approval.approve', 'for_individual', 'service'),
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationChangeField = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type ApplicationChangeRequest = {
  id: string;
  appId: string;
  appName: string;
  submittedBy: string;
  submittedAt: string;
  status: string;
  changes: ApplicationChangeField[];
};

type AccountDetailsObject = Record<string, unknown>;

function asDetailsObject(details: unknown): AccountDetailsObject {
  return details && typeof details === 'object' ? { ...(details as AccountDetailsObject) } : {};
}

function writePendingAppChangeDetails(
  details: unknown,
  appId: string,
  value: { requestId: string; status: 'pending'; requestedAt: string; requestedData: Record<string, unknown> },
): AccountDetailsObject {
  const next = asDetailsObject(details);
  const pendingRequests = next.pendingRequests && typeof next.pendingRequests === 'object'
    ? { ...(next.pendingRequests as Record<string, unknown>) }
    : {};
  const appChangeMap = pendingRequests.applicationChange && typeof pendingRequests.applicationChange === 'object'
    ? { ...(pendingRequests.applicationChange as Record<string, unknown>) }
    : {};
  appChangeMap[appId] = value as unknown as Record<string, unknown>;
  pendingRequests.applicationChange = appChangeMap;
  next.pendingRequests = pendingRequests;
  return next;
}

function clearPendingAppChangeDetails(details: unknown, appId: string): AccountDetailsObject {
  const next = asDetailsObject(details);
  const pendingRequests = next.pendingRequests && typeof next.pendingRequests === 'object'
    ? { ...(next.pendingRequests as Record<string, unknown>) }
    : {};
  const appChangeMap = pendingRequests.applicationChange && typeof pendingRequests.applicationChange === 'object'
    ? { ...(pendingRequests.applicationChange as Record<string, unknown>) }
    : {};
  delete appChangeMap[appId];
  pendingRequests.applicationChange = appChangeMap;
  next.pendingRequests = pendingRequests;
  return next;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const submitChangeSchema = z.object({
  appId: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required.').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500)
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['development', 'active', 'hold', 'blocked']),
});

// ---------------------------------------------------------------------------
// Submit a change request (owner action — replaces direct edit)
// ---------------------------------------------------------------------------

/**
 * Function submitApplicationChangeRequest.
 *
 * Called by the app owner when they save edits. Instead of writing directly
 * to the application table, this creates a pending Request record. A root
 * admin must approve it before the application is updated.
 */
export async function submitApplicationChangeRequest(
  input: z.infer<typeof submitChangeSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { success: false, error: 'Not signed in.' };

  const parsed = submitChangeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = messages?.[0] ?? 'Invalid value.';
    }
    return { success: false, fieldErrors };
  }

  const { appId, name, description, icon, website, status } = parsed.data;

  const canEdit = await canCurrentAccountEditApplicationBasics(appId);
  if (!canEdit) return { success: false, error: 'You do not have permission to submit application changes.' };

  // Fetch current values to record a diff
  const current = await prisma.application.findUnique({
    where: { id: appId },
    select: { name: true, description: true, icon: true, website: true, status: true },
  });

  if (!current) return { success: false, error: 'Application not found.' };

  const proposed = { name, description: description || null, icon: icon || null, website: website || null, status };

  const changes: ApplicationChangeField[] = (
    Object.keys(proposed) as Array<keyof typeof proposed>
  )
    .filter((key) => (current[key] ?? null) !== (proposed[key] ?? null))
    .map((key) => ({
      field: key,
      oldValue: (current[key] as string | null) ?? null,
      newValue: (proposed[key] as string | null) ?? null,
    }));

  if (changes.length === 0) {
    return { success: false, error: 'No changes detected.' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const newFields = new Set(changes.map((c) => c.field));
      const pendingRows = await tx.request.findMany({
        where: { action: 'applicationChange', status: 'pending', senderId: accountId },
        select: { id: true, data: true },
      });
      const pendingForThisApp = pendingRows
        .filter((row) => {
          const payload = (row.data ?? {}) as Record<string, unknown>;
          return payload.appId === appId;
        })
        .filter((row) => {
          const payload = (row.data ?? {}) as Record<string, unknown>;
          const rowChanges = Array.isArray(payload.changes)
            ? (payload.changes as Array<Record<string, unknown>>)
            : [];
          const rowFields = new Set(
            rowChanges
              .map((c) => (typeof c.field === 'string' ? c.field : ''))
              .filter((f) => f.length > 0)
          );
          for (const field of rowFields) {
            if (newFields.has(field)) return true;
          }
          return false;
        })
        .map((row) => row.id);

      if (pendingForThisApp.length > 0) {
        await tx.request.updateMany({
          where: { id: { in: pendingForThisApp } },
          data: { status: 'cancelled' },
        });
      }

      const req = await tx.request.create({
        data: {
          senderId: accountId,
          recipientId: accountId,
          action: 'applicationChange',
          type: 'applicationChanges',
          status: 'pending',
          data: {
            appId,
            requestId: '',
            requestedData: proposed,
            changes,
          },
        },
      });

      await tx.request.update({
        where: { id: req.id },
        data: {
          data: {
            appId,
            requestId: req.id,
            requestedData: proposed,
            changes,
          },
        },
      });

      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { details: true },
      });
      await tx.account.update({
        where: { id: accountId },
        data: {
          details: writePendingAppChangeDetails(account?.details, appId, {
            requestId: req.id,
            status: 'pending',
            requestedAt: new Date().toISOString(),
            requestedData: proposed,
          }) as Prisma.InputJsonValue,
        },
      });
    });

    await logActivity(appId, `Application change request submitted by owner`, 'Pending', undefined, accountId);

    revalidateApplicationEditRoutes(appId);
    revalidatePath('/requests/application-changes');

    return { success: true };
  } catch (error) {
    await logError('database', error, `submitApplicationChangeRequest:${appId}`);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// List pending application change requests (root admin)
// ---------------------------------------------------------------------------

/**
 * Function getApplicationChangeRequests.
 *
 * Returns pending (or all) application change requests. Optionally filtered
 * by appId when ?application=[id] is present.
 */
export async function getApplicationChangeRequests(options?: {
  appId?: string;
  status?: string;
}): Promise<ApplicationChangeRequest[]> {
  const canView = await checkPermissions(['requests.root_approval.view']);
  if (!canView) return [];

  try {
    const where: Record<string, unknown> = { action: 'applicationChange' };
    if (options?.status) {
      where.status = options.status;
    } else {
      where.status = 'pending';
    }

    const requests = await prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            individualProfile: { select: { firstName: true, lastName: true } },
            brandProfile: { select: { brandName: true } },
          },
        },
      },
    });

    const results: ApplicationChangeRequest[] = [];

    for (const req of requests) {
      const payload = (req.data ?? {}) as Record<string, unknown>;
      const appId = typeof payload.appId === 'string' ? payload.appId : '';

      // Filter by appId if requested
      if (options?.appId && appId !== options.appId) continue;

      const app = await prisma.application.findUnique({
        where: { id: appId },
        select: { name: true },
      });

      const sender = req.sender;
      const displayName =
        (sender.brandProfile?.brandName ??
        sender.displayName ??
        `${(sender.individualProfile?.firstName ?? '')} ${(sender.individualProfile?.lastName ?? '')}`.trim()) ||
        sender.id;

      results.push({
        id: req.id,
        appId,
        appName: app?.name ?? appId,
        submittedBy: displayName,
        submittedAt: req.createdAt.toLocaleString(),
        status: req.status,
        changes: Array.isArray(payload.changes) ? (payload.changes as ApplicationChangeField[]) : [],
      });
    }

    return results;
  } catch (error) {
    await logError('database', error, 'getApplicationChangeRequests');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get single request details
// ---------------------------------------------------------------------------

export async function getApplicationChangeRequestDetails(
  requestId: string,
): Promise<ApplicationChangeRequest | null> {
  const canView = await checkPermissions(['requests.root_approval.view']);
  if (!canView) return null;

  try {
    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            individualProfile: { select: { firstName: true, lastName: true } },
            brandProfile: { select: { brandName: true } },
          },
        },
      },
    });

    if (!req || req.action !== 'applicationChange') return null;

    const payload = (req.data ?? {}) as Record<string, unknown>;
    const appId = typeof payload.appId === 'string' ? payload.appId : '';

    const app = await prisma.application.findUnique({
      where: { id: appId },
      select: { name: true },
    });

    const sender = req.sender;
    const displayName =
      (sender.brandProfile?.brandName ??
      sender.displayName ??
      `${(sender.individualProfile?.firstName ?? '')} ${(sender.individualProfile?.lastName ?? '')}`.trim()) ||
      sender.id;

    return {
      id: req.id,
      appId,
      appName: app?.name ?? appId,
      submittedBy: displayName,
      submittedAt: req.createdAt.toLocaleString(),
      status: req.status,
      changes: Array.isArray(payload.changes) ? (payload.changes as ApplicationChangeField[]) : [],
    };
  } catch (error) {
    await logError('database', error, `getApplicationChangeRequestDetails:${requestId}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

export async function approveApplicationChangeRequest(
  requestId: string,
): Promise<{ success: boolean; error?: string }> {
  const canApprove = await checkPermissions(['requests.root_approval.approve']);
  if (!canApprove) return { success: false, error: 'Permission denied.' };

  const actorAccountId = await getActiveAccountId();
  if (!actorAccountId) return { success: false, error: 'Not signed in.' };

  try {
    const req = await prisma.request.findUnique({ where: { id: requestId } });
    if (!req || req.action !== 'applicationChange') {
      return { success: false, error: 'Request not found.' };
    }
    if (req.status !== 'pending') {
      return { success: false, error: 'This request has already been processed.' };
    }

    const payload = (req.data ?? {}) as Record<string, unknown>;
    const appId = typeof payload.appId === 'string' ? payload.appId : '';
    const proposed = ((payload.requestedData ?? payload.proposed ?? {}) as Record<string, string | null>);

    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: appId },
        data: {
          name: proposed.name ?? undefined,
          description: proposed.description ?? null,
          icon: proposed.icon ?? null,
          website: proposed.website ?? null,
          status: proposed.status ?? undefined,
        },
      });
      await tx.request.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });
      const account = await tx.account.findUnique({
        where: { id: req.senderId },
        select: { details: true },
      });
      await tx.account.update({
        where: { id: req.senderId },
        data: { details: clearPendingAppChangeDetails(account?.details, appId) as Prisma.InputJsonValue },
      });
    });

    await logActivity(appId, `Application change request approved`, 'Success', undefined, actorAccountId);

    revalidatePath('/application');
    revalidateApplicationEditRoutes(appId);
    revalidatePath('/requests/application-changes');

    return { success: true };
  } catch (error) {
    await logError('database', error, `approveApplicationChangeRequest:${requestId}`);
    return { success: false, error: 'Failed to approve. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Deny
// ---------------------------------------------------------------------------

export async function denyApplicationChangeRequest(
  requestId: string,
): Promise<{ success: boolean; error?: string }> {
  const canDeny = await checkPermissions(['requests.root_approval.approve']);
  if (!canDeny) return { success: false, error: 'Permission denied.' };

  const actorAccountId = await getActiveAccountId();
  if (!actorAccountId) return { success: false, error: 'Not signed in.' };

  try {
    const req = await prisma.request.findUnique({ where: { id: requestId } });
    if (!req || req.action !== 'applicationChange') {
      return { success: false, error: 'Request not found.' };
    }
    if (req.status !== 'pending') {
      return { success: false, error: 'This request has already been processed.' };
    }

    const payload = (req.data ?? {}) as Record<string, unknown>;
    const appId = typeof payload.appId === 'string' ? payload.appId : '';

    await prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: { status: 'denied' },
      });
      const account = await tx.account.findUnique({
        where: { id: req.senderId },
        select: { details: true },
      });
      await tx.account.update({
        where: { id: req.senderId },
        data: { details: clearPendingAppChangeDetails(account?.details, appId) as Prisma.InputJsonValue },
      });
    });

    await logActivity(appId, `Application change request denied`, 'Failed', undefined, actorAccountId);

    revalidatePath('/requests/application-changes');

    return { success: true };
  } catch (error) {
    await logError('database', error, `denyApplicationChangeRequest:${requestId}`);
    return { success: false, error: 'Failed to deny. Please try again.' };
  }
}
