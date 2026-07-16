import prisma from '@/core/helpers/prisma';
import { logError } from '@/logica/logger/files';

/*
::neup.documentation::bridge-dev-log-service
::title Bridge Development Log Service

Writes sanitized bridge request/response diagnostics for development applications.

::public

This file is used to persist development-only request and response logs for bridge endpoints.

::public end

::private

Secret-bearing keys such as `appSecret`, `authorization`, and `token` are redacted before persistence.

::private end

::end
*/

type JsonLike = Record<string, unknown> | unknown[] | string | number | boolean | null;

const SECRET_KEYS = new Set(['appsecret', 'app_secret', 'secret', 'authorization', 'token']);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = sanitizeValue(child);
  }
  return output;
}

function getClientIp(headers: Record<string, string | null | undefined>): string | null {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const cfIp = headers['cf-connecting-ip']?.trim();
  if (cfIp) return cfIp;
  const realIp = headers['x-real-ip']?.trim();
  if (realIp) return realIp;
  return null;
}

/*
::neup.documentation::write-application-dev-log
::function writeApplicationDevLog(input)

Writes a sanitized application development log row.

::public

Logging occurs only when the target application is in `development` status.

::public end

::private

This helper redacts known secret fields from headers, query data, request bodies, and response bodies before writing to `applicationDevLog`.

::private end

::end
*/
export async function writeApplicationDevLog(input: {
  appId: string | null | undefined;
  endpoint: string;
  method: string;
  requestHeaders: Record<string, string | null | undefined>;
  requestPath: string;
  requestQuery?: Record<string, string>;
  statusCode: number;
  requestBody?: JsonLike;
  responseBody?: JsonLike;
  error?: string;
}): Promise<void> {
  if (!input.appId) return;

  try {
    const app = await prisma.application.findUnique({
      where: { id: input.appId },
      select: { status: true },
    });
    if (!app || app.status !== 'development') return;

    const requestMeta = {
      headers: sanitizeValue({
        'content-type': input.requestHeaders['content-type'],
        'x-forwarded-for': input.requestHeaders['x-forwarded-for'],
      }),
      url: input.requestPath,
      search: input.requestQuery ?? {},
    };

    await prisma.applicationDevLog.create({
      data: {
        appId: input.appId,
        endpoint: input.endpoint,
        method: input.method,
        statusCode: input.statusCode,
        requesterIp: getClientIp(input.requestHeaders),
        origin: input.requestHeaders.origin ?? null,
        referer: input.requestHeaders.referer ?? null,
        userAgent: input.requestHeaders['user-agent'] ?? null,
        requestBody: input.requestBody ? (sanitizeValue(input.requestBody) as any) : undefined,
        responseBody: input.responseBody ? (sanitizeValue(input.responseBody) as any) : undefined,
        query: sanitizeValue(input.requestQuery ?? {}) as any,
        requestMeta: sanitizeValue(requestMeta) as any,
        error: input.error ?? null,
      },
    });
  } catch (error) {
    await logError('database', error, `writeApplicationDevLog:${input.appId}`);
  }
}
