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

The service resolves the application from `appSecret`, optionally resolves a target account from `connectionId`, and always scopes bridge operations to `notification.applicationId`.

::private end

::end
*/

type BridgeNotificationInput = {
  appSecret?: string | null;
  accountId?: string | null;
  connectionId?: string | null;
  notificationId?: string | null;
  limit?: string | number | null;
  offset?: string | number | null;
  action?: string | null;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  persistence?: string | null;
  detail?: unknown;
  deletableOn?: string | Date | null;
  read?: boolean | null;
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
  return Math.min(Math.floor(raw), MAX_LIMIT);
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
  | { ok: true; appId: string; accountId: string | null }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const appSecret = normalizeValue(input.appSecret);
  const accountIdInput = normalizeValue(input.accountId);
  const connectionId = normalizeValue(input.connectionId);

  if (!appSecret) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'invalid_request',
        error_description: 'appSecret is required.',
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
          select: { appSecret: true, status: true },
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

    if (!connection.application.appSecret || connection.application.appSecret !== appSecret) {
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

    return { ok: true, appId: connection.appId, accountId: connection.accountId };
  }

  const applications = await prisma.application.findMany({
    where: { appSecret },
    select: { id: true, status: true },
    take: 2,
  });

  if (applications.length === 0) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: 'invalid_app_secret' },
    };
  }

  if (applications.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: 'ambiguous_app_secret',
        error_description: 'This appSecret matches multiple applications. Supply connectionId to disambiguate.',
      },
    };
  }

  const application = applications[0];
  if (application.status === 'blocked' || application.status === 'rejected') {
    return {
      ok: false,
      status: 403,
      body: { success: false, error: 'application_not_active' },
    };
  }

  return { ok: true, appId: application.id, accountId: accountIdInput };
}

export async function bridgeGetNotifications(input: BridgeNotificationInput): Promise<BridgeNotificationResponse> {
  try {
    const resolved = await resolveApplicationAndTarget(input);
    if (!resolved.ok) return { status: resolved.status, body: resolved.body };

    const limit = parseLimit(input.limit);
    const offset = parseOffset(input.offset);
    const where: Prisma.NotificationWhereInput = {
      applicationId: resolved.appId,
      ...(resolved.accountId ? { accountId: resolved.accountId } : {}),
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
          accountId: resolved.accountId,
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

    const action = normalizeValue(input.action) ?? 'info';
    const title = normalizeValue(input.title);
    const message = normalizeValue(input.message);
    const type = normalizeValue(input.type) ?? 'info';
    const persistence = normalizeValue(input.persistence);
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
