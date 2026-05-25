'use server';

// Unified request fetcher — returns all request types in a normalised shape.
// Each request type maps to an `action` value stored in the `request` table,
// except kycVerification (uses the `verification` table) and
// accountDeletion (uses account.status = 'deletion_requested').

import prisma from '@/core/helpers/prisma';
import { checkPermissions } from '@/services/user';
import { logError } from '@/core/helpers/logger';
import { getUserProfile, getUserNeupIds } from '@/services/user';
import { REQUEST_TYPE_LABELS, UnifiedRequest, GetRequestsOptions } from './types';

// ---------------------------------------------------------------------------
// Helper — resolve display name from accountId
// ---------------------------------------------------------------------------

async function resolveDisplayName(accountId: string): Promise<string> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        displayName: true,
        individualProfile: { select: { firstName: true, lastName: true } },
        brandProfile: { select: { brandName: true } },
      },
    });
    if (!account) return accountId;
    return (
      (account.brandProfile?.brandName ??
      account.displayName ??
      `${account.individualProfile?.firstName ?? ''} ${account.individualProfile?.lastName ?? ''}`.trim()) ||
      accountId
    );
  } catch {
    return accountId;
  }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------



export async function getAllRequests(options: GetRequestsOptions = {}): Promise<UnifiedRequest[]> {
  const canView = await checkPermissions(['root.requests.view']);
  if (!canView) return [];

  const { type, application } = options;
  const results: UnifiedRequest[] = [];

  try {
    // -----------------------------------------------------------------------
    // 1. Request table — covers neupid, display_name, kyc, applicationChange,
    //    payment, report, and any other action stored there.
    // -----------------------------------------------------------------------
    const requestWhere: Record<string, unknown> = {};
    if (type && type !== 'kycVerification' && type !== 'accountDeletion') {
      requestWhere.action = type;
    } else if (!type) {
      // All types — exclude the special ones handled separately
      requestWhere.action = {
        notIn: [] as string[],
      };
    }

    if (type !== 'kycVerification' && type !== 'accountDeletion') {
      const rows = await prisma.request.findMany({
        where: requestWhere,
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

      for (const row of rows) {
        const payload = (row.data ?? {}) as Record<string, unknown>;

        // applicationChange — filter by appId if requested
        if (row.action === 'applicationChange' && application) {
          if (payload.appId !== application) continue;
        }

        const sender = row.sender;
        const displayName =
          (sender.brandProfile?.brandName ??
          sender.displayName ??
          `${sender.individualProfile?.firstName ?? ''} ${sender.individualProfile?.lastName ?? ''}`.trim()) ||
          sender.id;

        let summary = '';
        switch (row.action) {
          case 'neupid_request':
            summary = `Requesting NeupID: ${String(payload.requestedId ?? '')}`;
            break;
          case 'display_name_request':
            summary = `Requesting display name: ${String(payload.requestedDisplayName ?? '')}`;
            break;
          case 'kyc_request':
            summary = `KYC document: ${String(payload.documentType ?? 'unknown')}`;
            break;
          case 'applicationChange': {
            const changes = Array.isArray(payload.changes) ? payload.changes : [];
            const appName = typeof payload.appId === 'string' ? payload.appId : '';
            summary = `${changes.length} field change${changes.length !== 1 ? 's' : ''} for app ${appName}`;
            break;
          }
          default:
            summary = row.action;
        }

        results.push({
          id: row.id,
          type: row.action,
          typeLabel: REQUEST_TYPE_LABELS[row.action] ?? row.action,
          summary,
          submittedBy: displayName,
          submittedAt: row.createdAt.toLocaleString(),
          status: row.status,
          data: payload,
          memberId: row.senderId,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 2. kycVerification — from the verification table
    // -----------------------------------------------------------------------
    if (!type || type === 'kycVerification') {
      const verifications = await prisma.verification.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            select: {
              displayName: true,
              individualProfile: { select: { firstName: true, lastName: true } },
              brandProfile: { select: { brandName: true } },
            },
          },
        },
      });

      for (const v of verifications) {
        const acc = v.account;
        const displayName =
          (acc?.brandProfile?.brandName ??
          acc?.displayName ??
          `${acc?.individualProfile?.firstName ?? ''} ${acc?.individualProfile?.lastName ?? ''}`.trim()) ||
          v.accountId;

        results.push({
          id: v.id,
          type: 'kycVerification',
          typeLabel: 'KYC Verification',
          summary: `Account verification${v.category ? ` — ${v.category}` : ''}`,
          submittedBy: displayName,
          submittedAt: v.createdAt.toLocaleString(),
          status: v.status,
          data: {
            accountId: v.accountId,
            reason: v.reason,
            category: v.category,
            doneBy: v.doneBy,
            doneAt: v.doneAt?.toLocaleString(),
          },
          memberId: v.accountId,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 3. accountDeletion — accounts with status = 'deletion_requested'
    // -----------------------------------------------------------------------
    if (!type || type === 'accountDeletion') {
      const accounts = await prisma.account.findMany({
        where: { status: 'deletion_requested' },
        select: {
          id: true,
          displayName: true,
          individualProfile: { select: { firstName: true, lastName: true } },
          brandProfile: { select: { brandName: true } },
        },
      });

      for (const acc of accounts) {
        const displayName =
          (acc.brandProfile?.brandName ??
          acc.displayName ??
          `${acc.individualProfile?.firstName ?? ''} ${acc.individualProfile?.lastName ?? ''}`.trim()) ||
          acc.id;

        results.push({
          id: `deletion:${acc.id}`,
          type: 'accountDeletion',
          typeLabel: 'Account Deletion',
          summary: `Account deletion requested`,
          submittedBy: displayName,
          submittedAt: '',
          status: 'pending',
          data: { accountId: acc.id },
          memberId: acc.id,
        });
      }
    }

    // Sort all results by submittedAt descending (empty strings go last)
    results.sort((a, b) => {
      if (!a.submittedAt) return 1;
      if (!b.submittedAt) return -1;
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

    return results;
  } catch (error) {
    await logError('database', error, 'getAllRequests');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Single request detail
// ---------------------------------------------------------------------------

export async function getRequestDetail(id: string): Promise<UnifiedRequest | null> {
  const canView = await checkPermissions(['root.requests.view']);
  if (!canView) return null;

  try {
    // accountDeletion uses a synthetic id
    if (id.startsWith('deletion:')) {
      const accountId = id.replace('deletion:', '');
      const acc = await prisma.account.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          status: true,
          displayName: true,
          individualProfile: { select: { firstName: true, lastName: true } },
          brandProfile: { select: { brandName: true } },
        },
      });
      if (!acc) return null;
      const displayName =
        (acc.brandProfile?.brandName ??
        acc.displayName ??
        `${acc.individualProfile?.firstName ?? ''} ${acc.individualProfile?.lastName ?? ''}`.trim()) ||
        acc.id;
      return {
        id,
        type: 'accountDeletion',
        typeLabel: 'Account Deletion',
        summary: 'Account deletion requested',
        submittedBy: displayName,
        submittedAt: '',
        status: acc.status === 'deletion_requested' ? 'pending' : acc.status ?? 'unknown',
        data: { accountId: acc.id },
        memberId: acc.id,
      };
    }

    // Try verification table first
    const verification = await prisma.verification.findUnique({ where: { id } });
    if (verification) {
      const acc = await prisma.account.findUnique({
        where: { id: verification.accountId },
        select: {
          displayName: true,
          individualProfile: { select: { firstName: true, lastName: true } },
          brandProfile: { select: { brandName: true } },
        },
      });
      const displayName =
        (acc?.brandProfile?.brandName ??
        acc?.displayName ??
        `${acc?.individualProfile?.firstName ?? ''} ${acc?.individualProfile?.lastName ?? ''}`.trim()) ||
        verification.accountId;
      return {
        id: verification.id,
        type: 'kycVerification',
        typeLabel: 'KYC Verification',
        summary: `Account verification${verification.category ? ` — ${verification.category}` : ''}`,
        submittedBy: displayName,
        submittedAt: verification.createdAt.toLocaleString(),
        status: verification.status,
        data: {
          accountId: verification.accountId,
          reason: verification.reason,
          category: verification.category,
          doneBy: verification.doneBy,
          doneAt: verification.doneAt?.toLocaleString(),
        },
        memberId: verification.accountId,
      };
    }

    // Fall back to request table
    const row = await prisma.request.findUnique({
      where: { id },
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
    if (!row) return null;

    const payload = (row.data ?? {}) as Record<string, unknown>;
    const sender = row.sender;
    const displayName =
      (sender.brandProfile?.brandName ??
      sender.displayName ??
      `${sender.individualProfile?.firstName ?? ''} ${sender.individualProfile?.lastName ?? ''}`.trim()) ||
      sender.id;

    // Enrich payload for neupid
    let enrichedData: Record<string, unknown> = { ...payload };
    if (row.action === 'neupid_request') {
      const [profile, neupIds] = await Promise.all([
        getUserProfile(row.senderId),
        getUserNeupIds(row.senderId),
      ]);
      enrichedData = {
        ...enrichedData,
        userFullName: profile ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim() : displayName,
        currentNeupIds: neupIds,
        accountId: row.senderId,
      };
    }

    if (row.action === 'display_name_request') {
      enrichedData = { ...enrichedData, accountId: row.senderId };
    }

    if (row.action === 'kyc_request') {
      enrichedData = { ...enrichedData, accountId: row.senderId };
    }

    let summary = '';
    switch (row.action) {
      case 'neupid_request':
        summary = `Requesting NeupID: ${String(payload.requestedId ?? '')}`;
        break;
      case 'display_name_request':
        summary = `Requesting display name: ${String(payload.requestedDisplayName ?? '')}`;
        break;
      case 'kyc_request':
        summary = `KYC document: ${String(payload.documentType ?? 'unknown')}`;
        break;
      case 'applicationChange': {
        const changes = Array.isArray(payload.changes) ? payload.changes : [];
        summary = `${changes.length} field change${changes.length !== 1 ? 's' : ''}`;
        break;
      }
      default:
        summary = row.action;
    }

    return {
      id: row.id,
      type: row.action,
      typeLabel: REQUEST_TYPE_LABELS[row.action] ?? row.action,
      summary,
      submittedBy: displayName,
      submittedAt: row.createdAt.toLocaleString(),
      status: row.status,
      data: enrichedData,
      memberId: row.senderId,
    };
  } catch (error) {
    await logError('database', error, `getRequestDetail:${id}`);
    return null;
  }
}
