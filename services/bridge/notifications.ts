'use server';

import prisma from '@/core/database/prisma';
import type { Prisma } from '@/prisma/client';

/*
::neup.documentation::bridge-notification-service
::title Bridge Notification Service

Owns bridge notification reads and mutations for application-scoped notifications.

::public

Applications can create, list, mark-read, and delete notifications through the bridge notification endpoint using their app secret.

::public end

::private

The service resolves the application from `appSecret`, optionally resolves a target account from `connectionId`, and scopes normal reads to `notification.applicationId`. Wildcard reads are restricted to applications with `isInternal = true` and return all application-scoped notifications.

::private end

::end
*/

type BridgeNotificationInput = {
  appSecret?: string | null;
  applicationId?: string | null;
  mode?: string | null;
  accountId?: string | null;
  connectionId?: string | null;
  notificationId?: string | null;
  limit?: string | number | null;
  offset?: string | number | null;
  action?: string | null;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  persistence?: boolean | null;
  detail?: unknown;
  deletableOn?: string | Date | null;
  read?: boolean | null;
  patchAction?: 'read' | 'dismiss' | null;
};

type BridgeNotificationResponse = {
  status: number;
  body: Record<string, unknown>;
};

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

function normalizeValue(input?: string | null): string | null {
  const value = input?.trim();
  return value ? value : null;
}

function parseLimit(input: BridgeNotificationInput['limit']): number {
  const raw = typeof input === 'number' ? input : Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 10), MAX_LIMIT);
}

function parseOffset(input: BridgeNotificationInput['offset']): number {
  const raw = typeof input === 'number' ? input : Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

function serializeNotification(row: {
  id: string;
  accountId: string;
  applicationId: string | null;
  action: string | null;
  title: string | null;
  message: string | null;
  type: string;
  read: boolean;
  createdAt: Date;
  deletableOn: Date | null;
  persistence: string | null;
  detail: Prisma.JsonValue | null;
}) {
  return {
    id: row.id,
    accountId: row.accountId,
    applicationId: row.applicationId,
    action: row.action,
    title: row.title,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    deletableOn: row.deletableOn ? row.deletableOn.toISOString() : null,
    persistence: row.persistence,
    detail: row.detail,
  };
}

async function resolveApplicationAndTarget(input: BridgeNotificationInput): Promise<
  | { ok: true; appId: string; accountId: string | null; isInternal: boolean }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const applicationId = normalizeValue(input.applicationId);
  const appSecret = normalizeValue(input.appSecret);
  const accountIdInput = normalizeValue(input.accountId);
  const connectionId = normalizeValue(input.connectionId);

  if (Boolean(accountIdInput) && Boolean(connectionId)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'exactly_one_target_required' },
    };
  }

  if (!applicationId || !appSecret) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'applicationId and appSecret headers are required.',
      },
    };
  }

  if (connectionId) {
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
      select: {
        accountId: true,
        appId: true,
        application: {
          select: { appSecret: true, status: true, isInternal: true },
        },
      },
    });

    if (!connection) {
      return {
        ok: false,
        status: 404,
        body: { success: false, error: 'connection_not_found' },
      };
    }

    if (connection.appId !== applicationId || !connection.application.appSecret || connection.application.appSecret !== appSecret) {
      return {
        ok: false,
        status: 401,
        body: { success: false, error: 'invalid_app_secret' },
      };
    }

    if (connection.application.status === 'blocked' || connection.application.status === 'rejected') {
      return {
        ok: false,
        status: 403,
        body: { success: false, error: 'application_not_active' },
      };
    }

    if (accountIdInput && accountIdInput !== connection.accountId) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          error: 'account_connection_mismatch',
          error_description: 'accountId does not match the supplied connectionId.',
        },
      };
    }

    return {
      ok: true,
      appId: connection.appId,
      accountId: connection.accountId,
      isInternal: connection.application.isInternal,
    };
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, appSecret: true, status: true, isInternal: true },
  });
  if (!application || application.appSecret !== appSecret) {
    return { ok: false, status: 401, body: { success: false, error: 'invalid_app_credentials' } };
  }
  if (application.status === 'blocked' || application.status === 'rejected') {
    return {
      ok: false,
      status: 403,
      body: { success: false, error: 'application_not_active' },
    };
  }

  return { ok: true, appId: application.id, accountId: accountIdInput, isInternal: application.isInternal };
}

export async function bridgeGetNotifications(input: BridgeNotificationInput): Promise<BridgeNotificationResponse> {
  try {
    const resolved = await resolveApplicationAndTarget(input);
    if (!resolved.ok) return { status: resolved.status, body: resolved.body };

    const isWildcard = input.mode === 'wildcard';
    if (isWildcard && !resolved.isInternal) {
      return {
        status: 403,
        body: {
          success: false,
          error: 'wildcard_requires_internal_application',
          error_description: 'Wildcard notification access is limited to internal applications.',
        },
      };
    }

    const limit = parseLimit(input.limit);
    const offset = parseOffset(input.offset);
    const where: Prisma.NotificationWhereInput = {
      ...(isWildcard
        ? { applicationId: { not: null } }
        : {
            applicationId: resolved.appId,
            ...(resolved.accountId ? { accountId: resolved.accountId } : {}),
          }),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return {
      status: 200,
      body: {
        success: true,
        data: rows.map(serializeNotification),
        meta: {
          total,
          returned: rows.length,
          offset,
          limit,
          maxLimit: MAX_LIMIT,
          applicationId: resolved.appId,
          accountId: isWildcard ? null : resolved.accountId,
          mode: isWildcard ? 'wildcard' : 'scoped',
        },
      },
    };
  } catch (error) {
    console.error('bridgeGetNotifications', error);
    return { status: 500, body: { success: false, error: 'notification_fetch_failed' } };
  }
}

export async function bridgeCreateNotification(input: BridgeNotificationInput): Promise<BridgeNotificationResponse> {
  try {
    const resolved = await resolveApplicationAndTarget(input);
    if (!resolved.ok) return { status: resolved.status, body: resolved.body };
    if (!resolved.accountId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'invalid_request',
          error_description: 'accountId or connectionId is required to create a notification.',
        },
      };
    }

    const action = normalizeValue(input.action);
    if (!action || /\s/.test(action)) {
      return { status: 400, body: { success: false, error: 'invalid_action', error_description: 'action must be a non-empty string without spaces.' } };
    }
    const title = normalizeValue(input.title);
    if (!title) {
      return { status: 400, body: { success: false, error: 'invalid_title' } };
    }
    const message = normalizeValue(input.message);
    const type = normalizeValue(input.type);
    if (!type || !['warning', 'error', 'informative', 'success'].includes(type)) {
      return { status: 400, body: { success: false, error: 'invalid_type' } };
    }
    if (typeof input.persistence !== 'boolean') {
      return { status: 400, body: { success: false, error: 'invalid_persistence' } };
    }
    const persistence = input.persistence === true ? 'permanent' : null;
    const deletableOn = input.deletableOn ? new Date(input.deletableOn) : null;

    if (deletableOn && Number.isNaN(deletableOn.getTime())) {
      return {
        status: 400,
        body: { success: false, error: 'invalid_deletableOn' },
      };
    }

    const row = await prisma.notification.create({
      data: {
        accountId: resolved.accountId,
        applicationId: resolved.appId,
        action,
        title,
        message,
        type,
        persistence,
        deletableOn,
        detail: input.detail === undefined ? undefined : input.detail as Prisma.InputJsonValue,
        read: input.read ?? false,
      },
    });

    return {
      status: 201,
      body: {
        success: true,
        notification: serializeNotification(row),
      },
    };
  } catch (error) {
    console.error('bridgeCreateNotification', error);
    return { status: 500, body: { success: false, error: 'notification_create_failed' } };
  }
}

export async function bridgeMarkNotificationRead(input: BridgeNotificationInput): Promise<BridgeNotificationResponse> {
  try {
    const resolved = await resolveApplicationAndTarget(input);
    if (!resolved.ok) return { status: resolved.status, body: resolved.body };
    if (!resolved.accountId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'invalid_request',
          error_description: 'accountId or connectionId is required.',
        },
      };
    }

    const notificationId = normalizeValue(input.notificationId);
    if (!notificationId) {
      return {
        status: 400,
        body: { success: false, error: 'notificationId is required.' },
      };
    }

    if (input.patchAction !== 'read' && input.patchAction !== 'dismiss') {
      return { status: 400, body: { success: false, error: 'invalid_action', error_description: 'action must be read or dismiss.' } };
    }

    if (input.patchAction === 'dismiss') {
      const deleted = await prisma.notification.deleteMany({ where: { id: notificationId, accountId: resolved.accountId, applicationId: resolved.appId } });
      return deleted.count > 0
        ? { status: 200, body: { success: true } }
        : { status: 404, body: { success: false, error: 'notification_not_found' } };
    }

    const updated = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        accountId: resolved.accountId,
        applicationId: resolved.appId,
      },
      data: { read: true },
    });

    if (updated.count === 0) {
      return { status: 404, body: { success: false, error: 'notification_not_found' } };
    }

    return { status: 200, body: { success: true } };
  } catch (error) {
    console.error('bridgeMarkNotificationRead', error);
    return { status: 500, body: { success: false, error: 'notification_update_failed' } };
  }
}

export async function bridgeDeleteNotification(input: BridgeNotificationInput): Promise<BridgeNotificationResponse> {
  try {
    const resolved = await resolveApplicationAndTarget(input);
    if (!resolved.ok) return { status: resolved.status, body: resolved.body };
    if (!resolved.accountId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'invalid_request',
          error_description: 'accountId or connectionId is required.',
        },
      };
    }

    const notificationId = normalizeValue(input.notificationId);
    if (!notificationId) {
      return {
        status: 400,
        body: { success: false, error: 'notificationId is required.' },
      };
    }

    const deleted = await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        accountId: resolved.accountId,
        applicationId: resolved.appId,
      },
    });

    if (deleted.count === 0) {
      return { status: 404, body: { success: false, error: 'notification_not_found' } };
    }

    return { status: 200, body: { success: true } };
  } catch (error) {
    console.error('bridgeDeleteNotification', error);
    return { status: 500, body: { success: false, error: 'notification_delete_failed' } };
  }
}
