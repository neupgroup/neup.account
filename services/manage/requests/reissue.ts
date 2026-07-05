'use server';

import { permission } from '@/neup.logica/permission';
import prisma from '@/neup.core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { logError } from '@/neup.core/helpers/logger';

const servicePermissions = [
  permission('requests.root_approval.approve', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-requests-reissue-module
 * ::title Request Reissue Service
 *
 * Reissues previously processed requests with reviewer remarks.
 *
 * ::public
 *
 * Use this service when a reviewer needs to send a request back into the pending queue with explanatory remarks.
 *
 * ::public end
 *
 * ::private
 *
 * The service also cancels overlapping pending `applicationChange` requests that target the same fields.
 *
 * ::private end
 *
 * ::end
 */

function hasOverlap(fieldsA: string[], fieldsB: string[]) {
  const setA = new Set(fieldsA);
  return fieldsB.some((f) => setA.has(f));
}

export async function reissueRequestWithRemarks(input: { requestId: string; remarks: string }) {
  /**
   * ::neup.documentation::manage-requests-reissue-with-remarks
   * ::function reissueRequestWithRemarks(input)
   *
   * Creates a new pending request from an existing non-pending request and attaches reviewer remarks.
   *
   * ::public
   *
   * The caller must provide the original request ID and at least five characters of remarks.
   *
   * ::public end
   *
   * ::private
   *
   * Reissued requests record the source request ID, remarks, and reissue timestamp inside the new request payload.
   *
   * ::private end
   *
   * ::end
   */
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
