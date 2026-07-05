'use server';

// Unified request fetcher — returns all request types in a normalised shape.
// Each request type maps to an `action` value stored in the `request` table,
// except kycVerification (uses the `verification` table) and
// accountDeletion (uses account.status = 'deletion_requested').

import prisma from '@/neup.core/helpers/prisma';
import { permission } from '@/logica/permission';
import { checkPermissions } from '@/services/user';
import { logError } from '@/neup.core/helpers/logger';
import { getUserProfile, getUserNeupIds } from '@/services/user';
import { getActiveAccountId } from '@/neup.core/auth/verify';
import { canCurrentAccountViewApplicationRoles } from '@/services/applications/manage';
import { REQUEST_TYPE_LABELS, UnifiedRequest, GetRequestsOptions } from './types';

const servicePermissions = [
  permission('requests.root_approval.view', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-all-requests-module
 * ::title Unified Request Service
 *
 * Aggregates request-like records from multiple stores into one normalized manage-facing feed.
 *
 * ::public
 *
 * Use this service when a manage UI needs to list or inspect requests across NeupID, display-name, KYC, application, verification, and deletion workflows.
 *
 * ::public end
 *
 * ::private
 *
 * The service combines data from `request`, `verification`, `account`, and related application/profile tables and applies root or application-scoped access checks before returning data.
 *
 * ::private end
 *
 * ::end
 */

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

const BASIC_INFO_FIELDS = new Set(['name', 'description', 'icon', 'website']);
const API_FIELDS = new Set(['dataDeletionApi', 'dataDeletionPage', 'accountBlockApi', 'logoutApi']);

function getApplicationChangeScope(
  changes: Array<Record<string, unknown>>
): 'basic info' | 'configuration' | 'API fields' {
  const fields = changes
    .map((change) => {
      if (typeof change.field === 'string') return change.field;
      if (typeof change.key === 'string') return change.key;
      if (typeof change.name === 'string') return change.name;
      return '';
    })
    .filter(Boolean);

  if (fields.some((field) => API_FIELDS.has(field))) return 'API fields';
  if (fields.every((field) => BASIC_INFO_FIELDS.has(field))) return 'basic info';
  return 'configuration';
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------



export async function getAllRequests(options: GetRequestsOptions = {}): Promise<UnifiedRequest[]> {
  /**
   * ::neup.documentation::manage-all-requests-get-all
   * ::function getAllRequests(options)
   *
   * Returns the normalized request feed for the requested scope.
   *
   * ::public
   *
   * Callers can filter by request type and, for application-related requests, by application ID.
   *
   * ::public end
   *
   * ::private
   *
   * The feed merges ordinary `request` rows with special-case verification rows and deletion-requested accounts, then sorts them by submitted time.
   *
   * ::private end
   *
   * ::end
   */
  const { type, application } = options;
  const [activeAccountId, canViewRoot] = await Promise.all([
    getActiveAccountId(),
    checkPermissions(['requests.root_approval.view']),
  ]);
  const canViewApplication = application && activeAccountId
    ? await canCurrentAccountViewApplicationRoles(application)
    : false;
  if (!canViewRoot && !canViewApplication) return [];

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
      const appIds = Array.from(
        new Set(
          rows
            .map((row) => {
              const payload = (row.data ?? {}) as Record<string, unknown>;
              return typeof payload.appId === 'string' ? payload.appId : null;
            })
            .filter((id): id is string => !!id)
        )
      );
      const applications = appIds.length
        ? await prisma.application.findMany({
            where: { id: { in: appIds } },
            select: { id: true, name: true },
          })
        : [];
      const appNameMap = new Map(applications.map((app) => [app.id, app.name]));

      for (const row of rows) {
        const payload = (row.data ?? {}) as Record<string, unknown>;

        // Application-scoped requests — filter by appId if requested
        if ((row.action === 'applicationChange' || row.action === 'applicationRoleRequest') && application) {
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
            summary = `Requesting NeupID: ${String(payload.requestedNeupId ?? payload.requestedId ?? '')}`;
            break;
          case 'display_name_request':
            summary = `Requesting display name: ${String(payload.requestedDisplayName ?? '')}`;
            break;
          case 'kyc_request':
            summary = `KYC document: ${String(payload.documentType ?? 'unknown')}`;
            break;
          case 'applicationChange': {
            const changes = Array.isArray(payload.changes) ? payload.changes : [];
            const appId = typeof payload.appId === 'string' ? payload.appId : '';
            const appName = appNameMap.get(appId) || appId || displayName;
            const scope = getApplicationChangeScope(changes as Array<Record<string, unknown>>);
            summary = `${appName} requested change of their ${scope}.`;
            break;
          }
          case 'applicationRoleRequest': {
            const appId = typeof payload.appId === 'string' ? payload.appId : '';
            const appName = appNameMap.get(appId) || appId || 'Application';
            const roles = Array.isArray(payload.roles) ? payload.roles : [];
            const roleNames = roles
              .map((role) => role && typeof role === 'object' && 'name' in role ? String((role as Record<string, unknown>).name ?? '') : '')
              .filter(Boolean);
            summary = `${displayName} requested ${roleNames.join(', ') || 'application role'} for ${appName}.`;
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
        orderBy: { doneAt: 'desc' },
        select: {
          id: true,
          accountId: true,
          status: true,
          reason: true,
          category: true,
          doneBy: true,
          doneAt: true,
          account: {
            select: {
              displayName: true,
              individualProfile: { select: { firstName: true, lastName: true } },
              brandProfile: { select: { brandName: true } },
            },
          }
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
          submittedAt: v.doneAt?.toLocaleString() || '',
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
      const accountIds = accounts.map((a) => a.id);
      const deletionActivityByAccount = accountIds.length
        ? await prisma.activity.groupBy({
            by: ['memberId'],
            where: {
              memberId: { in: accountIds },
              action: { in: ['Account Deletion Requested', 'Account Deletion Requested by Admin'] },
            },
            _max: { timestamp: true },
          })
        : [];
      const deletionAtMap = new Map(
        deletionActivityByAccount.map((row) => [row.memberId, row._max.timestamp?.toLocaleString() || ''])
      );

      for (const acc of accounts) {
        const displayName =
          (acc.brandProfile?.brandName ??
          acc.displayName ??
          `${acc.individualProfile?.firstName ?? ''} ${acc.individualProfile?.lastName ?? ''}`.trim()) ||
          'User';

        results.push({
          id: `deletion:${acc.id}`,
          type: 'accountDeletion',
          typeLabel: 'Account Deletion',
          summary: `${displayName} requested their account deletion.`,
          submittedBy: displayName,
          submittedAt: deletionAtMap.get(acc.id) || '',
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
  /**
   * ::neup.documentation::manage-all-requests-get-detail
   * ::function getRequestDetail(id)
   *
   * Returns one normalized request detail record by ID.
   *
   * ::public
   *
   * This helper understands synthetic deletion IDs, verification IDs, and ordinary request-table IDs.
   *
   * ::public end
   *
   * ::private
   *
   * Certain request types are enriched with extra payload data such as current NeupIDs, pending request metadata, or application names before being returned.
   *
   * ::private end
   *
   * ::end
   */
  const [activeAccountId, canViewRoot] = await Promise.all([
    getActiveAccountId(),
    checkPermissions(['requests.root_approval.view']),
  ]);

  try {
    // accountDeletion uses a synthetic id
    if (id.startsWith('deletion:')) {
      if (!canViewRoot) return null;
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
    const verification = await prisma.verification.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
        status: true,
        reason: true,
        category: true,
        doneBy: true,
        doneAt: true,
      },
    });
    if (verification) {
      if (!canViewRoot) return null;
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
        submittedAt: verification.doneAt?.toLocaleString() || '',
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
    const appId = typeof payload.appId === 'string' ? payload.appId : '';
    const canViewApplication = row.action === 'applicationRoleRequest' && !!activeAccountId && !!appId
      ? await canCurrentAccountViewApplicationRoles(appId)
      : false;
    if (!canViewRoot && !canViewApplication) return null;

    const sender = row.sender;
    const displayName =
      (sender.brandProfile?.brandName ??
      sender.displayName ??
      `${sender.individualProfile?.firstName ?? ''} ${sender.individualProfile?.lastName ?? ''}`.trim()) ||
      sender.id;

    const senderAccount = await prisma.account.findUnique({
      where: { id: row.senderId },
      select: { details: true },
    });
    const senderDetails =
      senderAccount?.details && typeof senderAccount.details === 'object'
        ? (senderAccount.details as Record<string, unknown>)
        : {};

    // Enrich payload for neupid
    let enrichedData: Record<string, unknown> = { ...payload };
    if (row.action === 'neupid_request') {
      const [profile, neupIds] = await Promise.all([
        getUserProfile(row.senderId),
        getUserNeupIds(row.senderId),
      ]);
      const pendingRequests =
        senderDetails.pendingRequests && typeof senderDetails.pendingRequests === 'object'
          ? (senderDetails.pendingRequests as Record<string, unknown>)
          : {};
      const pendingNeupid =
        pendingRequests.neupid && typeof pendingRequests.neupid === 'object'
          ? (pendingRequests.neupid as Record<string, unknown>)
          : {};
      enrichedData = {
        ...enrichedData,
        requestedNeupId: String(
          pendingNeupid.requestedNeupId ??
          payload.requestedNeupId ??
          payload.requestedId ??
          ''
        ),
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

    if (row.action === 'applicationChange') {
      const appId = typeof payload.appId === 'string' ? payload.appId : '';
      const pendingRequests =
        senderDetails.pendingRequests && typeof senderDetails.pendingRequests === 'object'
          ? (senderDetails.pendingRequests as Record<string, unknown>)
          : {};
      const pendingAppChangeMap =
        pendingRequests.applicationChange && typeof pendingRequests.applicationChange === 'object'
          ? (pendingRequests.applicationChange as Record<string, unknown>)
          : {};
      const pendingAppChange =
        pendingAppChangeMap[appId] && typeof pendingAppChangeMap[appId] === 'object'
          ? (pendingAppChangeMap[appId] as Record<string, unknown>)
          : {};
      const requestedData =
        pendingAppChange.requestedData && typeof pendingAppChange.requestedData === 'object'
          ? (pendingAppChange.requestedData as Record<string, unknown>)
          : ((payload.requestedData ?? payload.proposed ?? {}) as Record<string, unknown>);
      const app = appId
        ? await prisma.application.findUnique({
            where: { id: appId },
            select: { name: true },
          })
        : null;
      const changes = Array.isArray(payload.changes) ? payload.changes : [];
      const scope = getApplicationChangeScope(changes as Array<Record<string, unknown>>);
      enrichedData = {
        ...enrichedData,
        requestedData,
        appId,
        appName: app?.name ?? '',
        requestedScope: scope,
      };
    }

    if (row.action === 'applicationRoleRequest') {
      const appId = typeof payload.appId === 'string' ? payload.appId : '';
      const app = appId
        ? await prisma.application.findUnique({
            where: { id: appId },
            select: { name: true },
          })
        : null;
      enrichedData = {
        ...enrichedData,
        appId,
        appName: app?.name ?? '',
      };
    }

    let summary = '';
    switch (row.action) {
      case 'neupid_request':
        summary = `Requesting NeupID: ${String(enrichedData.requestedNeupId ?? '')}`;
        break;
      case 'display_name_request':
        summary = `Requesting display name: ${String(payload.requestedDisplayName ?? '')}`;
        break;
      case 'kyc_request':
        summary = `KYC document: ${String(payload.documentType ?? 'unknown')}`;
        break;
      case 'applicationChange': {
        const appName = String(enrichedData.appName ?? '');
        const scope = String(enrichedData.requestedScope ?? 'configuration');
        summary = `${appName || displayName} requested change of their ${scope}.`;
        break;
      }
      case 'applicationRoleRequest': {
        const roles = Array.isArray(enrichedData.roles) ? enrichedData.roles : [];
        const roleNames = roles
          .map((role) => role && typeof role === 'object' && 'name' in role ? String((role as Record<string, unknown>).name ?? '') : '')
          .filter(Boolean);
        summary = `${displayName} requested ${roleNames.join(', ') || 'application role'} for ${String(enrichedData.appName ?? '') || 'application'}.`;
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
