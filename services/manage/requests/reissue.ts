'use server';

import prisma from '@/core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';

function hasOverlap(fieldsA: string[], fieldsB: string[]) {
  const setA = new Set(fieldsA);
  return fieldsB.some((f) => setA.has(f));
}

export async function reissueRequestWithRemarks(input: { requestId: string; remarks: string }) {
  const canApprove = await checkPermissions(['requests.root_approval.approve']);
  if (!canApprove) return { success: false, error: 'Permission denied.' };

  const remarks = input.remarks?.trim() || '';
  if (remarks.length < 5) return { success: false, error: 'Remarks are required (min 5 chars).' };

  try {
    const existing = await prisma.request.findUnique({ where: { id: input.requestId } });
    if (!existing) return { success: false, error: 'Request not found.' };
    if (existing.status === 'pending') return { success: false, error: 'Pending requests cannot be reissued.' };

    const payload = (existing.data ?? {}) as Record<string, unknown>;

    await prisma.$transaction(async (tx) => {
      if (existing.action === 'applicationChange') {
        const appId = typeof payload.appId === 'string' ? payload.appId : '';
        const requestedChanges = Array.isArray(payload.changes) ? payload.changes as Array<Record<string, unknown>> : [];
        const requestedFields = requestedChanges
          .map((c) => (typeof c.field === 'string' ? c.field : ''))
          .filter((f) => f.length > 0);

        const pendingRows = await tx.request.findMany({
          where: { senderId: existing.senderId, action: 'applicationChange', status: 'pending' },
          select: { id: true, data: true },
        });
        const overlapIds = pendingRows
          .filter((row) => {
            const rowPayload = (row.data ?? {}) as Record<string, unknown>;
            if (rowPayload.appId !== appId) return false;
            const rowChanges = Array.isArray(rowPayload.changes) ? rowPayload.changes as Array<Record<string, unknown>> : [];
            const rowFields = rowChanges
              .map((c) => (typeof c.field === 'string' ? c.field : ''))
              .filter((f) => f.length > 0);
            return hasOverlap(requestedFields, rowFields);
          })
          .map((row) => row.id);

        if (overlapIds.length > 0) {
          await tx.request.updateMany({
            where: { id: { in: overlapIds } },
            data: { status: 'cancelled' },
          });
        }
      }

      await tx.request.create({
        data: {
          senderId: existing.senderId,
          recipientId: existing.recipientId,
          action: existing.action,
          type: existing.type,
          status: 'pending',
          data: {
            ...payload,
            reissueFrom: existing.id,
            reissueRemarks: remarks,
            reissuedAt: new Date().toISOString(),
          },
        },
      });
    });

    return { success: true };
  } catch (error) {
    await logError('database', error, `reissueRequestWithRemarks:${input.requestId}`);
    return { success: false, error: 'Failed to reissue request.' };
  }
}
