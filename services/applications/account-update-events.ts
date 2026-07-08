'use server';

import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { activeAccessWhere } from '@/services/access-model';
import {
  deriveLegacyRoleScopesFromPolicy,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';
import {
  getRoleAccessFlags,
  normalizeRoleAcquisitionType,
  normalizeRoleApprovalPolicy,
} from '@/services/role-scopes';

const ACCOUNT_UPDATE_WEBHOOK_TYPE = 'accountUpdateWebhook';
const SOURCE_APP_ID = 'neup.account';

/*
::neup.documentation::account-updated-webhook-dispatcher
::function dispatchAccountUpdatedEvent(input)

Builds and dispatches encrypted `account.updated` webhook payloads to connected applications.

::public

The webhook event includes `success`, `eventId`, `eventType`, `sourceAppId`, `occurredAt`, `appId`, `connectionId`, `changedFields`, `account`, and `profile`.

::public end

::private

The payload is encrypted with AES-256-GCM derived from `Application.appSecret`, signed with `x-bridge-signature`, and optionally dev-logged through `applicationDevLog`.

::private end

::param external input
::datatype object
::required true

Dispatch input containing the changed account id and changed field list.

::details

The implementation gathers the receiving app connections, resolves role state when needed, shapes the public payload, encrypts it per target application, and records delivery diagnostics for development apps.

::end
*/

export type AccountUpdateEventField =
  | 'neupId'
  | 'displayName'
  | 'displayImage'
  | 'gender'
  | 'dateOfBirth'
  | 'role'
  | 'access'
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

async function logAccountUpdateWebhookDispatch(input: {
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
    await logError('database', error, `logAccountUpdateWebhookDispatch:${input.appId}`);
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

function extractApplicableFor(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export async function dispatchAccountUpdatedEvent(input: DispatchInput): Promise<{
  sent: number;
  delivered: number;
  succeeded: number;
  results: DispatchResult[];
}> {
  const changedFields = Array.from(new Set(input.changedFields));
  if (changedFields.length === 0) return { sent: 0, delivered: 0, succeeded: 0, results: [] };
  console.log('[account.updated] checking if it requires event dispatch', {
    accountId: input.accountId,
    changedFields,
  });

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
          select: { dateOfBirth: true },
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
            role: {
              select: {
                id: true,
                name: true,
              },
            },
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

    const activeRoleRows = changedFields.includes('role')
      ? await prisma.access.findMany({
          where: {
            memberAccountId: input.accountId,
            accessApplicationId: { in: Array.from(new Set(account.connections.map((connection) => connection.appId))) },
            ...activeAccessWhere(),
          },
          select: {
            accessApplicationId: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                scopeFor: true,
                scopeLevel: true,
                acquisitionType: true,
                approvalPolicy: true,
                applicableFor: true,
                permissionMappings: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    permission: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];

    const rolesByAppId = new Map<string, Array<{
      id: string;
      name: string;
      description: string | null;
      scope: string[];
      acquisitionType: string;
      approvalPolicy: string;
      assignable: boolean;
      publiclyEnrollable: boolean;
      selfAssigned: boolean;
      rootManaged: boolean;
      publiclyRequestable: boolean;
      requestableToOwner: boolean;
      applicableFor: string[];
      permissions: string[];
    }>>();

    for (const row of activeRoleRows) {
      if (!row.role || !row.accessApplicationId) continue;
      const current = rolesByAppId.get(row.accessApplicationId) ?? [];
      current.push({
        ...getRoleAccessFlags(row.role.acquisitionType, row.role.approvalPolicy),
        id: row.role.id,
        name: row.role.name,
        description: row.role.description ?? null,
        scope: deriveLegacyRoleScopesFromPolicy(
          normalizeAuthzScopeFor(row.role.scopeFor),
          normalizeSingleAuthzScopeLevel(row.role.scopeLevel),
        ),
        acquisitionType: normalizeRoleAcquisitionType(row.role.acquisitionType),
        approvalPolicy: normalizeRoleApprovalPolicy(row.role.approvalPolicy),
        applicableFor: extractApplicableFor(row.role.applicableFor),
        permissions: Array.from(
          new Set(
            row.role.permissionMappings
              .map((mapping) => mapping.permission?.name?.trim() ?? '')
              .filter(Boolean),
          ),
        ),
      });
      rolesByAppId.set(row.accessApplicationId, current);
    }

    for (const [appId, roles] of rolesByAppId) {
      rolesByAppId.set(
        appId,
        Array.from(new Map(roles.map((role) => [role.id, role])).values()).sort((a, b) => a.name.localeCompare(b.name)),
      );
    }

    const scannedTargets = account.connections.map((connection) => ({
        connectionId: connection.id,
        appId: connection.appId,
        appSecret: connection.application.appSecret?.trim() ?? '',
        appStatus: connection.application.status,
        webhookUrl: connection.application.bridge[0]?.value?.trim() ?? '',
      }));

    console.log('[account.updated] scanned target connections', {
      accountId: input.accountId,
      totalConnections: scannedTargets.length,
      targets: scannedTargets.map((t) => ({
        appId: t.appId,
        connectionId: t.connectionId,
        webhookUrl: t.webhookUrl || null,
        hasSecret: t.appSecret.length > 0,
      })),
    });

    const targets = scannedTargets
      .filter((target) => target.webhookUrl.length > 0 && target.appSecret.length > 0);

    if (targets.length === 0) {
      console.log('[account.updated] found "does not requires dispatch"', {
        reason: 'No target with both webhookUrl and appSecret.',
        accountId: input.accountId,
      });
      return { sent: 0, delivered: 0, succeeded: 0, results: [] };
    }

    console.log('[account.updated] found "requires dispatch"', {
      accountId: input.accountId,
      dispatchTargetCount: targets.length,
    });

    const occurredAt = new Date().toISOString();
    const eventId = randomUUID();

    const profileChanges: Record<string, unknown> = {};
    if (changedFields.includes('displayName')) profileChanges.displayName = account.displayName;
    if (changedFields.includes('displayImage')) profileChanges.displayImage = account.displayImage;
    if (changedFields.includes('gender')) {
      profileChanges.gender = typeof detailsRecord.gender === 'string' ? detailsRecord.gender : null;
    }

    const accountChanges: Record<string, unknown> = {};
    if (changedFields.includes('neupId')) accountChanges.neupId = account.neupIds[0]?.neupId ?? null;
    if (changedFields.includes('dateOfBirth')) {
      accountChanges.dateOfBirth = toIsoDateOnly(account.individualProfile?.dateOfBirth);
    }
    if (changedFields.includes('isMinor')) {
      accountChanges.isMinor = typeof detailsRecord.isMinor === 'boolean' ? detailsRecord.isMinor : null;
    }
    if (changedFields.includes('accountType')) accountChanges.accountType = account.accountType ?? null;
    const basePayload = {
      eventId,
      eventType: 'account.updated',
      sourceAppId: SOURCE_APP_ID,
      occurredAt,
      changedFields,
    };

    const settled = await Promise.allSettled(
      targets.map(async (target) => {
        const payload: Record<string, unknown> = {
          success: true,
          ...basePayload,
          appId: target.appId,
          connectionId: target.connectionId,
          account: {
            id: account.id,
          },
        };
        if (Object.keys(accountChanges).length > 0) {
          payload.account = {
            ...(payload.account as Record<string, unknown>),
            ...accountChanges,
          };
        }
        if (Object.keys(profileChanges).length > 0) payload.profile = profileChanges;
        if (changedFields.includes('role')) {
          payload.account = {
            ...(payload.account as Record<string, unknown>),
            roles: rolesByAppId.get(target.appId) ?? [],
          };
        }
        const encrypted = encryptForApp(JSON.stringify(payload), target.appSecret);
        const signature = signEnvelope(encrypted, target.appSecret);
        const requestBody = {
          eventType: 'account.updated',
          encrypted: true,
          iv: encrypted.iv,
          tag: encrypted.tag,
          data: encrypted.data,
        } as const;

        console.log(`[account.updated] sending events to webhook at "${target.webhookUrl}"`, {
          appId: target.appId,
          connectionId: target.connectionId,
          changedFields,
          occurredAt,
          encrypted: true,
          iv: requestBody.iv,
          tag: requestBody.tag,
          dataLength: requestBody.data.length,
        });
        console.log('[account.updated] awaiting for response', {
          appId: target.appId,
          connectionId: target.connectionId,
          webhookUrl: target.webhookUrl,
        });

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

        console.log('[account.updated] got response', {
          appId: target.appId,
          connectionId: target.connectionId,
          webhookUrl: target.webhookUrl,
          status: response.status,
          ok: response.ok,
          responseBody,
          successAck: success,
        });

        // Always persist a dispatch trace for observability of outbound events.
        // This gives us a verifiable audit trail for both success and failure.
        await logAccountUpdateWebhookDispatch({
          appId: target.appId,
          webhookUrl: target.webhookUrl,
          statusCode: response.status,
          requestBody: requestBody as unknown as Record<string, unknown>,
          responseBody,
          error: success
            ? undefined
            : responseBody && typeof responseBody === 'object' && 'error' in responseBody
              ? String((responseBody as { error?: unknown }).error)
              : `Webhook did not return success:true (HTTP ${response.status}).`,
        });

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
      console.error('[account.updated] dispatch:error', {
        appId: target.appId,
        connectionId: target.connectionId,
        webhookUrl: target.webhookUrl,
        error: entry.reason instanceof Error ? entry.reason.message : 'Webhook request failed.',
      });
      await logAccountUpdateWebhookDispatch({
        appId: target.appId,
        webhookUrl: target.webhookUrl,
        statusCode: 0,
        requestBody: { eventType: 'account.updated', encrypted: true },
        error: entry.reason instanceof Error ? entry.reason.message : 'Webhook request failed.',
      });

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
