'use server';

import { randomUUID } from 'crypto';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

const ACCOUNT_UPDATE_WEBHOOK_TYPE = 'accountUpdateWebhook';
const SOURCE_APP_ID = 'neup.account';

export type AccountUpdateEventField =
  | 'neupId'
  | 'displayName'
  | 'displayImage'
  | 'gender'
  | 'dateOfBirth'
  | 'role'
  | 'isMinor'
  | 'accountType';

type DispatchInput = {
  accountId: string;
  changedFields: AccountUpdateEventField[];
};

type DispatchResult = {
  appId: string;
  webhookUrl: string;
  ok: boolean;
  status?: number;
  recorded?: boolean;
  responseBody?: unknown;
  error?: string;
};

function toIsoDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export async function dispatchAccountUpdatedEvent(input: DispatchInput): Promise<{
  sent: number;
  delivered: number;
  recorded: number;
  results: DispatchResult[];
}> {
  const changedFields = Array.from(new Set(input.changedFields));
  if (changedFields.length === 0) return { sent: 0, delivered: 0, recorded: 0, results: [] };

  try {
    const account = await prisma.account.findUnique({
      where: { id: input.accountId },
      select: {
        id: true,
        accountType: true,
        displayName: true,
        displayImage: true,
        details: true,
        individualProfile: {
          select: { dateOfBirth: true, roleId: true },
        },
        neupIds: {
          where: { isPrimary: true },
          select: { neupId: true },
          take: 1,
        },
        connections: {
          select: {
            id: true,
            appId: true,
            application: {
              select: {
                bridge: {
                  where: { type: ACCOUNT_UPDATE_WEBHOOK_TYPE },
                  select: { value: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!account) return { sent: 0, delivered: 0, recorded: 0, results: [] };

    const detailsRecord =
      account.details && typeof account.details === 'object'
        ? (account.details as Record<string, unknown>)
        : {};

    const targets = account.connections
      .map((connection) => ({
        connectionId: connection.id,
        appId: connection.appId,
        webhookUrl: connection.application.bridge[0]?.value?.trim() ?? '',
      }))
      .filter((target) => target.webhookUrl.length > 0);

    if (targets.length === 0) return { sent: 0, delivered: 0, recorded: 0, results: [] };

    const occurredAt = new Date().toISOString();
    const eventId = randomUUID();
    const basePayload = {
      eventId,
      eventType: 'account.updated',
      sourceAppId: SOURCE_APP_ID,
      occurredAt,
      account: {
        neupId: account.neupIds[0]?.neupId ?? null,
        displayName: account.displayName,
        displayImage: account.displayImage,
        gender: typeof detailsRecord.gender === 'string' ? detailsRecord.gender : null,
        dateOfBirth: toIsoDateOnly(account.individualProfile?.dateOfBirth),
        role: account.individualProfile?.roleId ?? null,
        isMinor: typeof detailsRecord.isMinor === 'boolean' ? detailsRecord.isMinor : null,
        accountType: account.accountType ?? null,
      },
      changedFields,
    };

    const secret = process.env.BRIDGE_WEBHOOK_SECRET;

    const settled = await Promise.allSettled(
      targets.map(async (target) => {
        const payload = { ...basePayload, appId: target.appId, connectionId: target.connectionId };
        const response = await fetch(target.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { 'x-bridge-secret': secret } : {}),
          },
          body: JSON.stringify(payload),
        });

        let responseBody: unknown = null;
        let recorded = false;

        try {
          responseBody = await response.json();
          if (
            responseBody &&
            typeof responseBody === 'object' &&
            'recorded' in responseBody &&
            (responseBody as { recorded?: unknown }).recorded === true
          ) {
            recorded = true;
          }
        } catch {
          responseBody = null;
        }

        return {
          appId: target.appId,
          webhookUrl: target.webhookUrl,
          ok: response.ok,
          status: response.status,
          recorded,
          responseBody,
        } satisfies DispatchResult;
      }),
    );

    const results: DispatchResult[] = settled.map((entry, index) => {
      if (entry.status === 'fulfilled') return entry.value;
      return {
        appId: targets[index].appId,
        webhookUrl: targets[index].webhookUrl,
        ok: false,
        error: entry.reason instanceof Error ? entry.reason.message : 'Webhook request failed.',
      };
    });

    const delivered = results.filter((result) => result.ok).length;
    const recorded = results.filter((result) => result.recorded).length;

    return { sent: targets.length, delivered, recorded, results };
  } catch (error) {
    await logError('webhook', error, `dispatchAccountUpdatedEvent:${input.accountId}`);
    return { sent: 0, delivered: 0, recorded: 0, results: [] };
  }
}
