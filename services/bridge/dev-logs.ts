import { NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

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

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

export async function writeApplicationDevLog(input: {
  appId: string | null | undefined;
  endpoint: string;
  method: string;
  request: NextRequest;
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
        'content-type': input.request.headers.get('content-type'),
        'x-forwarded-for': input.request.headers.get('x-forwarded-for'),
      }),
      url: input.request.nextUrl.pathname,
      search: Object.fromEntries(input.request.nextUrl.searchParams.entries()),
    };

    await prisma.applicationDevLog.create({
      data: {
        appId: input.appId,
        endpoint: input.endpoint,
        method: input.method,
        statusCode: input.statusCode,
        requesterIp: getClientIp(input.request),
        origin: input.request.headers.get('origin'),
        referer: input.request.headers.get('referer'),
        userAgent: input.request.headers.get('user-agent'),
        requestBody: input.requestBody ? (sanitizeValue(input.requestBody) as any) : undefined,
        responseBody: input.responseBody ? (sanitizeValue(input.responseBody) as any) : undefined,
        query: sanitizeValue(Object.fromEntries(input.request.nextUrl.searchParams.entries())) as any,
        requestMeta: sanitizeValue(requestMeta) as any,
        error: input.error ?? null,
      },
    });
  } catch (error) {
    await logError('database', error, `writeApplicationDevLog:${input.appId}`);
  }
}

