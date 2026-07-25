import { NextResponse, type NextRequest } from 'next/server';
import { constants, privateDecrypt } from 'crypto';
import {
  bridgeCreateNotification,
  bridgeDeleteNotification,
  bridgeGetNotifications,
  bridgeMarkNotificationRead,
} from '@/services/bridge/notifications';
import { writeApplicationDevLog } from '@/services/bridge/dev-logs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type BodyObject = Record<string, unknown>;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function resolveOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const referer = request.headers.get('referer');
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  const origin = resolveOrigin(request);
  return new NextResponse(null, {
    status: 204,
    headers: origin ? corsHeaders(origin) : undefined,
  });
}

function base64urlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0
    ? normalized
    : normalized + '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(padded, 'base64').toString('utf8');
}

function normalizePem(pem: string): string {
  const normalized = pem.trim().replace(/\\n/g, '\n');
  return normalized.includes('-----/n') || normalized.includes('/n-----')
    ? normalized.replace(/\/n/g, '\n')
    : normalized;
}

function decryptPublicKeyPayload(input: string): BodyObject {
  const privateKey = process.env.AUTH_PRIVATE_KEY;
  if (!privateKey) return {};

  try {
    const encrypted = Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const decrypted = privateDecrypt(
      {
        key: normalizePem(privateKey),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      encrypted,
    ).toString('utf8');
    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as BodyObject
      : {};
  } catch {
    return {};
  }
}

function parseEncodedPayload(input: unknown): BodyObject {
  if (!input || typeof input !== 'string') return {};

  const encryptedPayload = decryptPublicKeyPayload(input);
  if (Object.keys(encryptedPayload).length > 0) return encryptedPayload;

  try {
    const parsed = JSON.parse(base64urlDecode(input));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as BodyObject
      : {};
  } catch {
    return {};
  }
}

function normalizeKey(input: string): string {
  return input.replace(/[_-]/g, '').toLowerCase();
}

function readValue(input: BodyObject, canonical: string): string | null {
  const target = normalizeKey(canonical);
  for (const [key, value] of Object.entries(input)) {
    if (normalizeKey(key) !== target || typeof value !== 'string') continue;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function readNumberValue(input: BodyObject, canonical: string): string | number | null {
  const target = normalizeKey(canonical);
  for (const [key, value] of Object.entries(input)) {
    if (normalizeKey(key) !== target) continue;
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function readBooleanValue(input: BodyObject, canonical: string): boolean | null {
  const target = normalizeKey(canonical);
  for (const [key, value] of Object.entries(input)) {
    if (normalizeKey(key) !== target) continue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
  }
  return null;
}

async function readJsonBody(request: NextRequest): Promise<BodyObject> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return {};

  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as BodyObject
      : {};
  } catch {
    return {};
  }
}

function readQueryInput(request: NextRequest): BodyObject {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  return {
    ...parseEncodedPayload(query.payload),
    ...query,
    appSecret: query.appSecret ?? request.headers.get('appSecret') ?? request.headers.get('x-app-secret') ?? undefined,
    accountId: query.accountId ?? request.headers.get('accountId') ?? request.headers.get('x-account-id') ?? undefined,
    connectionId: query.connectionId ?? request.headers.get('connectionId') ?? request.headers.get('x-connection-id') ?? undefined,
  };
}

function buildServiceInput(input: BodyObject) {
  return {
    appSecret: readValue(input, 'appSecret'),
    accountId: readValue(input, 'accountId'),
    connectionId: readValue(input, 'connectionId'),
    notificationId: readValue(input, 'notificationId') ?? readValue(input, 'id'),
    limit: readNumberValue(input, 'limit'),
    offset: readNumberValue(input, 'offset'),
    action: readValue(input, 'action'),
    title: readValue(input, 'title'),
    message: readValue(input, 'message'),
    type: readValue(input, 'type'),
    persistence: readValue(input, 'persistence'),
    deletableOn: readValue(input, 'deletableOn'),
    read: readBooleanValue(input, 'read'),
    detail: Object.prototype.hasOwnProperty.call(input, 'detail') ? input.detail : undefined,
  };
}

async function respond(
  request: NextRequest,
  method: string,
  rawInput: BodyObject,
  result: { status: number; body: Record<string, unknown> },
) {
  const appIdForLog =
    typeof result.body?.meta === 'object' && result.body.meta && 'applicationId' in result.body.meta
      ? String((result.body.meta as Record<string, unknown>).applicationId ?? '')
      : typeof result.body?.notification === 'object' && result.body.notification && 'applicationId' in result.body.notification
        ? String((result.body.notification as Record<string, unknown>).applicationId ?? '')
        : null;

  await writeApplicationDevLog({
    appId: appIdForLog,
    endpoint: '/bridge/api.v1/notification',
    method,
    requestHeaders: {
      'content-type': request.headers.get('content-type'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
      'x-real-ip': request.headers.get('x-real-ip'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      'user-agent': request.headers.get('user-agent'),
    },
    requestPath: request.nextUrl.pathname,
    requestQuery: Object.fromEntries(request.nextUrl.searchParams.entries()),
    statusCode: result.status,
    requestBody: method === 'GET' ? undefined : rawInput,
    responseBody: result.body,
    error: typeof result.body.error === 'string' ? result.body.error : undefined,
  });

  const origin = resolveOrigin(request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: origin ? corsHeaders(origin) : undefined,
  });
}

async function readMutationInput(request: NextRequest): Promise<BodyObject> {
  const body = await readJsonBody(request);
  return {
    ...parseEncodedPayload(body.payload),
    ...body,
  };
}

/**
 * ::neup.documentation::bridge-notification-endpoint
 * ::api /bridge/api.v1/notification
 *
 * Application-scoped notification API.
 *
 * ::public
 *
 * `GET` lists notifications, `POST` creates one notification, `PATCH` marks a notification as read, and `DELETE` deletes a notification.
 *
 * ::public end
 *
 * ::private
 *
 * Credentials are normalized in the route and authorization/data semantics live in `services/bridge/notifications.ts`.
 *
 * ::private end
 *
 * ::end
 */
export async function GET(request: NextRequest) {
  const input = readQueryInput(request);
  const result = await bridgeGetNotifications(buildServiceInput(input));
  return respond(request, 'GET', input, result);
}

export async function POST(request: NextRequest) {
  const input = await readMutationInput(request);
  const result = await bridgeCreateNotification(buildServiceInput(input));
  return respond(request, 'POST', input, result);
}

export async function PATCH(request: NextRequest) {
  const input = await readMutationInput(request);
  const result = await bridgeMarkNotificationRead(buildServiceInput(input));
  return respond(request, 'PATCH', input, result);
}

export async function DELETE(request: NextRequest) {
  const input = await readMutationInput(request);
  const result = await bridgeDeleteNotification(buildServiceInput(input));
  return respond(request, 'DELETE', input, result);
}
