'use server';

import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import prisma from '@/.neup/core/database/prisma';
import { logError } from '@/.neup/logica/logger/files';
import {
  getScopeLevelsFromStoredPolicy,
  normalizeAuthzScopeFor,
  normalizeSingleAuthzScopeLevel,
  type AuthzScopeFor,
  type AuthzScopeLevel,
} from '@/services/applications/authz-scope-policy';
import { getAuthzScopePolicyColumnSupport } from '@/services/applications/authz-scope-policy-columns';

const BRIDGE_TYPE = 'roleUpdateWebhook';
const SOURCE_APP_ID = 'neup.account';

/*
::neup.documentation::role-updated-webhook-dispatcher
::function dispatchRoleUpdateWebhook(input)

Builds and dispatches encrypted `role.updated` and `role.deleted` webhook payloads.

::public

`role.updated` carries the full role shape, including denormalized permissions. `role.deleted` carries the role identity needed for receiver-side deletion.

::public end

::private

The dispatcher encrypts the payload with AES-256-GCM using `Application.appSecret`, signs the envelope with HMAC-SHA256, and stores delivery logs for development apps.

::private end

::param external input
::datatype object
::required true

Dispatch input containing `appId`, `eventType`, and the role payload.

::details

The public contract is defined by the payload construction in this file. Receiver-facing documentation should be generated from here rather than maintained in a parallel markdown document.

::end
*/

type RoleEventType = 'role.updated' | 'role.deleted';

type RolePayload = {
  id: string;
  name: string;
  description: string | null;
  scopeFor: AuthzScopeFor[];
  scopeLevel: AuthzScopeLevel;
  acquisitionType: string;
  approvalPolicy: string;
  applicableFor: string[];
  permissions: string[];
};

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

function extractPermissionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const maybeName = (item as Record<string, unknown>).name;
      if (typeof maybeName === 'string' && maybeName.trim().length > 0) out.push(maybeName);
    }
  }
  return Array.from(new Set(out));
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

function deriveScopeLevelFromLegacyPolicy(scopeLevel: unknown, acquisitionType: string | null | undefined, approvalPolicy: string | null | undefined): AuthzScopeLevel {
  const normalized = normalizeSingleAuthzScopeLevel(scopeLevel);
  if (normalized !== 'assignable.byTeam' || scopeLevel === 'assignable.byTeam') {
    return normalized;
  }

  return getScopeLevelsFromStoredPolicy(acquisitionType, approvalPolicy)[0] ?? 'assignable.byTeam';
}

export async function dispatchRoleUpdateWebhook(input: {
  appId: string;
  eventType: RoleEventType;
  role: RolePayload;
}): Promise<void> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: input.appId },
      select: {
        appSecret: true,
        status: true,
        bridge: {
          where: { type: BRIDGE_TYPE },
          select: { value: true },
          take: 1,
        },
      },
    });

    const webhookUrl = app?.bridge[0]?.value?.trim() ?? '';
    const appSecret = app?.appSecret?.trim() ?? '';
    if (!app || !webhookUrl || !appSecret) return;

    const payload: Record<string, unknown> = {
      success: true,
      eventId: randomUUID(),
      eventType: input.eventType,
      appId: input.appId,
      sourceAppId: SOURCE_APP_ID,
      occurredAt: new Date().toISOString(),
      role: { id: input.role.id, name: input.role.name },
    };
    if (input.eventType === 'role.updated') {
      payload.role = {
        id: input.role.id,
        name: input.role.name,
        description: input.role.description,
        scopeFor: input.role.scopeFor,
        scopeLevel: input.role.scopeLevel,
        acquisitionType: input.role.acquisitionType,
        approvalPolicy: input.role.approvalPolicy,
        applicableFor: input.role.applicableFor,
        permissions: input.role.permissions,
      };
    }

    const encrypted = encryptForApp(JSON.stringify(payload), appSecret);
    const signature = signEnvelope(encrypted, appSecret);
    const requestBody = {
      eventType: input.eventType,
      encrypted: true,
      iv: encrypted.iv,
      tag: encrypted.tag,
      data: encrypted.data,
    };

    const response = await fetch(webhookUrl, {
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
      success = Boolean(
        responseBody &&
        typeof responseBody === 'object' &&
        'success' in responseBody &&
        (responseBody as { success?: unknown }).success === true,
      );
    } catch {
      responseBody = null;
    }

    if (app.status === 'development') {
      await prisma.applicationDevLog.create({
        data: {
          appId: input.appId,
          endpoint: `/bridge/webhook.v1/role/${input.eventType}`,
          method: 'POST',
          statusCode: response.status,
          requestBody: requestBody as any,
          responseBody: (responseBody ?? null) as any,
          requestMeta: {
            webhookUrl,
            source: SOURCE_APP_ID,
            eventType: input.eventType,
          } as any,
          error: success
            ? null
            : responseBody && typeof responseBody === 'object' && 'error' in responseBody
              ? String((responseBody as { error?: unknown }).error)
              : `Webhook did not return success:true (HTTP ${response.status}).`,
        },
      });
    }
  } catch (error) {
    await logError('webhook', error, `dispatchRoleUpdateWebhook:${input.appId}`);
  }
}

export async function getRolePayload(appId: string, roleId: string): Promise<RolePayload | null> {
  try {
    const columnSupport = await getAuthzScopePolicyColumnSupport();
    const role = await prisma.authzRole.findFirst({
      where: { id: roleId, appId },
      select: columnSupport.role ? {
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
      } as any : {
        id: true,
        name: true,
        description: true,
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
      } as any,
    }) as any;
    if (!role) return null;
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      scopeFor: normalizeAuthzScopeFor(role.scopeFor),
      scopeLevel: deriveScopeLevelFromLegacyPolicy(role.scopeLevel, role.acquisitionType, role.approvalPolicy),
      acquisitionType: role.acquisitionType ?? 'assignment',
      approvalPolicy: role.approvalPolicy ?? 'none',
      applicableFor: extractApplicableFor(role.applicableFor),
      permissions: Array.from(
        new Set(
          role.permissionMappings
            .map((mapping: any) => mapping.permission?.name?.trim() ?? '')
            .filter(Boolean),
        ),
      ),
    };
  } catch (error) {
    await logError('database', error, `getRolePayload:${appId}:${roleId}`);
    return null;
  }
}
