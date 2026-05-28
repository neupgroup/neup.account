'use server';

import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
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
  success?: boolean;
  responseBody?: unknown;
  error?: string;
};

async function logAccountUpdateWebhookFailure(input: {
  appId: string;
  webhookUrl: string;
  statusCode: number;
  requestBody: Record<string, unknown>;
  responseBody?: unknown;
  error?: string;
}): Promise<void> {
  try {
    await prisma.applicationDevLog.create({
      data: {
        appId: input.appId,
        endpoint: '/bridge/webhook.v1/account/updated',
        method: 'POST',
        statusCode: input.statusCode,
        requestBody: input.requestBody as any,
        responseBody: (input.responseBody ?? null) as any,
        requestMeta: {
          webhookUrl: input.webhookUrl,
          source: SOURCE_APP_ID,
          eventType: 'account.updated',
        } as any,
        error: input.error ?? null,
      },
    });
  } catch (error) {
    await logError('database', error, `logAccountUpdateWebhookFailure:${input.appId}`);
  }
}

function toIsoDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function deriveAesKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptForApp(plainText: string, appSecret: string): { iv: string; tag: string; data: string } {
  const key = deriveAesKey(appSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function signEnvelope(envelope: { iv: string; tag: string; data: string }, appSecret: string): string {
  const signingInput = `${envelope.iv}.${envelope.tag}.${envelope.data}`;
  return createHmac('sha256', appSecret).update(signingInput, 'utf8').digest('hex');
}

export async function dispatchAccountUpdatedEvent(input: DispatchInput): Promise<{
  sent: number;
  delivered: number;
  succeeded: number;
  results: DispatchResult[];
}> {
  const changedFields = Array.from(new Set(input.changedFields));
  if (changedFields.length === 0) return { sent: 0, delivered: 0, succeeded: 0, results: [] };

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
                appSecret: true,
                status: true,
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

    if (!account) return { sent: 0, delivered: 0, succeeded: 0, results: [] };

    const detailsRecord =
      account.details && typeof account.details === 'object'
        ? (account.details as Record<string, unknown>)
        : {};

    const targets = account.connections
      .map((connection) => ({
        connectionId: connection.id,
        appId: connection.appId,
        appSecret: connection.application.appSecret?.trim() ?? '',
        appStatus: connection.application.status,
        webhookUrl: connection.application.bridge[0]?.value?.trim() ?? '',
      }))
      .filter((target) => target.webhookUrl.length > 0 && target.appSecret.length > 0);

    if (targets.length === 0) return { sent: 0, delivered: 0, succeeded: 0, results: [] };

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

    const settled = await Promise.allSettled(
      targets.map(async (target) => {
        const payload = { ...basePayload, appId: target.appId, connectionId: target.connectionId };
        const encrypted = encryptForApp(JSON.stringify(payload), target.appSecret);
        const signature = signEnvelope(encrypted, target.appSecret);
        const requestBody = {
          eventType: 'account.updated',
          encrypted: true,
          iv: encrypted.iv,
          tag: encrypted.tag,
          data: encrypted.data,
        } as const;
        const response = await fetch(target.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bridge-signature': signature,
            'x-bridge-encryption': 'aes-256-gcm',
            'x-bridge-signature-alg': 'hmac-sha256',
          },
          body: JSON.stringify(requestBody),
        });

        let responseBody: unknown = null;
        let success = false;

        try {
          responseBody = await response.json();
          if (
            responseBody &&
            typeof responseBody === 'object' &&
            'success' in responseBody &&
            (responseBody as { success?: unknown }).success === true
          ) {
            success = true;
          }
        } catch {
          responseBody = null;
        }

        if (target.appStatus === 'development' && !success) {
          await logAccountUpdateWebhookFailure({
            appId: target.appId,
            webhookUrl: target.webhookUrl,
            statusCode: response.status,
            requestBody: requestBody as unknown as Record<string, unknown>,
            responseBody,
            error:
              responseBody && typeof responseBody === 'object' && 'error' in responseBody
                ? String((responseBody as { error?: unknown }).error)
                : `Webhook did not return success:true (HTTP ${response.status}).`,
          });
        }

        return {
          appId: target.appId,
          webhookUrl: target.webhookUrl,
          ok: response.ok,
          status: response.status,
          success,
          responseBody,
        } satisfies DispatchResult;
      }),
    );

    const results: DispatchResult[] = await Promise.all(settled.map(async (entry, index) => {
      if (entry.status === 'fulfilled') return entry.value;

      const target = targets[index];
      if (target.appStatus === 'development') {
        await logAccountUpdateWebhookFailure({
          appId: target.appId,
          webhookUrl: target.webhookUrl,
          statusCode: 0,
          requestBody: { eventType: 'account.updated', encrypted: true },
          error: entry.reason instanceof Error ? entry.reason.message : 'Webhook request failed.',
        });
      }

      return {
        appId: targets[index].appId,
        webhookUrl: targets[index].webhookUrl,
        ok: false,
        error: entry.reason instanceof Error ? entry.reason.message : 'Webhook request failed.',
      };
    }));

    const delivered = results.filter((result) => result.ok).length;
    const succeeded = results.filter((result) => result.success).length;

    return { sent: targets.length, delivered, succeeded, results };
  } catch (error) {
    await logError('webhook', error, `dispatchAccountUpdatedEvent:${input.accountId}`);
    return { sent: 0, delivered: 0, succeeded: 0, results: [] };
  }
}
