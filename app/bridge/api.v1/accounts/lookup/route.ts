import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';
import { writeApplicationDevLog } from '@/services/bridge/dev-logs';
import { resolveDisplayImage } from '@/inapp/display-image';
import { normalizeApplicationId } from '@/services/applications/identifiers';
import { verifyAccountToken } from '@/services/auth/account-token';
import { validateAuthSession } from '@/services/auth/session';

/*
::neup.documentation::bridge-accounts-lookup-route
::api POST /bridge/api.v1/accounts/lookup
::title Bridge Account User Info Lookup

Looks up user information for an application integration.

::public

Send JSON only. Do not pass `appId`, `appSecret`, `accountId`, or `connectionId`
in query parameters or headers.

Supported lookup modes:

1. App-secret account lookup: send `appId`, `appSecret`, and `accountId`.
2. App-secret connection lookup: send `appId`, `appSecret`, and `connectionId`.
3. Auth-cookie self lookup: send `appId` and the `auth_account` cookie.

When `fields` is omitted, the response profile includes the basic fields:
`displayName`, `displayImage`, `connectionId`, `accountId`, and `accountType`.
When `fields` is provided, only requested allowed fields are returned.

For party `0` and `1` applications, app-secret lookup may return any supported
lookup field. For party `2` and `3` applications, app-secret lookup requires an
active connection with the requested account, and the response is capped to:
`connectionId`, `appId`, `displayName`, `displayImage`, `gender`, `isMinor`,
`birthDate`, and `createdAt`.

Auth-cookie lookup returns the signed-in account's user-info payload for the
provided `appId`.

::public end

::private

The route validates application credentials before app-secret lookups, validates
`auth_account` through `verifyAccountToken()` and `validateAuthSession()` for
cookie lookups, and writes every response through application dev logs.

Status codes:
`200` for successful lookups, `400` for malformed or mixed lookup inputs, `401`
for invalid app credentials or invalid cookies, `403` for inactive restricted
party connections, `404` for missing applications/accounts/connections, and
`500` for unexpected server errors.

::private end

::end
*/

export const dynamic = 'force-dynamic';
type LookupField =
  | 'neupid'
  | 'displayName'
  | 'accountId'
  | 'displayImage'
  | 'lastActive'
  | 'isMinor'
  | 'connectionId'
  | 'accountType'
  | 'appId'
  | 'gender'
  | 'birthDate'
  | 'createdAt';

const defaultLookupFields = [
  'displayName',
  'displayImage',
  'connectionId',
  'accountId',
  'accountType',
] as const satisfies readonly LookupField[];
const lookupFields = [
  'neupid',
  'displayName',
  'accountId',
  'displayImage',
  'lastActive',
  'isMinor',
  'connectionId',
  'accountType',
  'appId',
  'gender',
  'birthDate',
  'createdAt',
] as const satisfies readonly LookupField[];
const thirdPartyLookupFields = [
  'connectionId',
  'appId',
  'displayName',
  'displayImage',
  'gender',
  'isMinor',
  'birthDate',
  'createdAt',
] as const satisfies readonly LookupField[];
const lookupFieldSet = new Set<LookupField>(lookupFields);
const thirdPartyLookupFieldSet = new Set<LookupField>(thirdPartyLookupFields);

type AccountRecord = NonNullable<Awaited<ReturnType<typeof getLookupAccount>>>;
type ConnectionRecord = Awaited<ReturnType<typeof getLookupConnection>>;

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid method. Please make a POST request.',
    },
    { status: 405 }
  );
}

function hasDisallowedLocationInput(request: NextRequest): boolean {
  const q = request.nextUrl.searchParams;

  // Reject if sent via URL query string
  if (q.has('accountId') || q.has('connectionId') || q.has('appId') || q.has('appSecret')) {
    return true;
  }

  // Reject if sent via headers (case-insensitive)
  const headerKeys = ['accountid', 'connectionid', 'appid', 'appsecret', 'auth_account'];
  for (const key of headerKeys) {
    if (request.headers.get(key) !== null) {
      return true;
    }
  }

  return false;
}

function asLookupFields(value: unknown): LookupField[] | null {
  if (!Array.isArray(value)) return null;

  return Array.from(
    new Set(
      value.filter(
        (field: unknown): field is LookupField =>
          typeof field === 'string' && lookupFieldSet.has(field as LookupField),
      ),
    ),
  );
}

function selectFields(fields: LookupField[] | null, allowedFields = lookupFieldSet): LookupField[] {
  // Missing `fields` means the caller gets the default public identity snapshot.
  const requested = fields?.length ? fields : [...defaultLookupFields];

  // Party restrictions are enforced by passing a smaller allowed-field set.
  return requested.filter((field) => allowedFields.has(field));
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;

  const now = new Date();
  return now.getUTCFullYear() - dob.getUTCFullYear() - (
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
      ? 1
      : 0
  );
}

function readDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function getLookupAccount(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      displayName: true,
      displayImage: true,
      accountType: true,
      details: true,
      createdAt: true,
      individualProfile: {
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          dateOfBirth: true,
          details: true,
        },
      },
      brandProfile: {
        select: {
          brandName: true,
        },
      },
      neupIds: {
        where: { isPrimary: true },
        select: { neupId: true },
        take: 1,
      },
    },
  });
}

async function getLookupConnection(input: { appId: string; accountId?: string | null; connectionId?: string | null }) {
  if (input.connectionId) {
    return prisma.connection.findUnique({
      where: { id: input.connectionId },
      select: {
        id: true,
        accountId: true,
        appId: true,
        status: true,
        connectedAt: true,
      },
    });
  }

  if (!input.accountId) return null;

  return prisma.connection.findUnique({
    where: { accountId_appId: { accountId: input.accountId, appId: input.appId } },
    select: {
      id: true,
      accountId: true,
      appId: true,
      status: true,
      connectedAt: true,
    },
  });
}

async function getLatestActiveIso(accountId: string): Promise<string | null> {
  const latestSession = await prisma.authnSession.findFirst({
    where: { accountId },
    orderBy: { lastLoggedIn: 'desc' },
    select: { lastLoggedIn: true },
  });

  return latestSession?.lastLoggedIn?.toISOString() ?? null;
}

function buildProfile(input: {
  account: AccountRecord;
  connection: ConnectionRecord | null;
  appId: string;
  lastActive: string | null;
  fields: LookupField[];
}): Record<string, unknown> {
  // Profile values can live in account.details, individual profile details, or direct account columns.
  const accountDetails = readDetails(input.account.details);
  const nestedProfile = readDetails(accountDetails.profile);
  const individualDetails = readDetails(input.account.individualProfile?.details);
  const dob = input.account.individualProfile?.dateOfBirth ?? null;
  const age = calculateAge(dob);
  const gender =
    (typeof accountDetails.gender === 'string' && accountDetails.gender) ||
    (typeof individualDetails.gender === 'string' && individualDetails.gender) ||
    null;
  const displayName =
    input.account.brandProfile?.brandName ||
    input.account.displayName ||
    [input.account.individualProfile?.firstName, input.account.individualProfile?.middleName, input.account.individualProfile?.lastName]
      .filter(Boolean)
      .join(' ') ||
    null;

  const valueByField: Record<LookupField, unknown> = {
    connectionId: input.connection?.id ?? null,
    appId: input.appId,
    accountId: input.account.id,
    displayName,
    displayImage: resolveDisplayImage({
      displayImage:
        (typeof nestedProfile.displayImage === 'string' && nestedProfile.displayImage.trim().length > 0
          ? nestedProfile.displayImage.trim()
          : null) ?? input.account.displayImage ?? null,
      accountType: input.account.accountType ?? null,
      gender,
    }),
    accountType: input.account.accountType ?? null,
    lastActive: input.lastActive,
    neupid: input.account.neupIds[0]?.neupId ?? null,
    birthDate: dob ? dob.toISOString() : null,
    isMinor: typeof age === 'number' ? age < 18 : null,
    gender,
    createdAt: input.account.createdAt.toISOString(),
  };

  // Return only fields selected for this request and party policy.
  const profile: Record<string, unknown> = {};
  for (const field of input.fields) {
    profile[field] = valueByField[field];
  }
  return profile;
}

export async function POST(request: NextRequest) {
  let requestBodyForLog: Record<string, unknown> | null = null;

  const respond = async (payload: Record<string, unknown>, status: number, appIdForLog?: string | null) => {
    await writeApplicationDevLog({
      appId: appIdForLog ?? normalizeApplicationId(typeof requestBodyForLog?.appId === 'string' ? requestBodyForLog.appId : null),
      endpoint: '/bridge/api.v1/accounts/lookup',
      method: 'POST',
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
      statusCode: status,
      requestBody: requestBodyForLog ?? undefined,
      responseBody: payload,
      error: typeof payload.error === 'string' ? payload.error : undefined,
    });
    return NextResponse.json(payload, { status });
  };

  if (hasDisallowedLocationInput(request)) {
    return respond(
      { success: false, reason: 'invalid location used. use raw json to make request.' },
      400
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return respond(
      { success: false, reason: 'invalid location used. use raw json to make request.' },
      400
    );
  }

  let appId: string | null = null;
  let appSecret: string | null = null;
  let accountId: string | null = null;
  let connectionId: string | null = null;
  let requestedFields: LookupField[] | null = null;

  try {
    const body = await request.json();
    requestBodyForLog = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    appId = normalizeApplicationId(
      typeof body?.appId === 'string' ? body.appId :
        typeof body?.AppId === 'string' ? body.AppId :
          typeof body?.appid === 'string' ? body.appid :
            typeof body?.app_id === 'string' ? body.app_id :
              typeof body?.['app-id'] === 'string' ? body['app-id'] :
                null,
    );
    appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : null;
    accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : null;
    connectionId = typeof body?.connectionId === 'string' ? body.connectionId.trim() : null;
    requestedFields = asLookupFields(body?.fields);
  } catch {
    return respond(
      { success: false, error: 'Invalid JSON body.' },
      400,
      appId
    );
  }

  if (!appId) {
    return respond(
      { success: false, error: 'appId is required.' },
      400,
      appId
    );
  }

  if (accountId && connectionId) {
    return respond(
      { success: false, error: 'Provide either accountId or connectionId, not both.' },
      400,
      appId
    );
  }

  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true, appSecret: true, party: true },
    });

    if (!application) {
      return respond(
        { success: false, error: 'Application not found.' },
        404,
        appId
      );
    }

    const authAccountToken = request.cookies.get('auth_account')?.value?.trim() || null;
    let lookupMode: 'appSecret' | 'authAccount';
    let targetAccountId: string | null = accountId;
    let connection: ConnectionRecord | null = null;

    // Server-to-server integrations authenticate with appSecret and can target an account or connection.
    if (appSecret) {
      lookupMode = 'appSecret';

      if (!application.appSecret || application.appSecret !== appSecret) {
        return respond(
          { success: false, error: 'Invalid application credentials.' },
          401,
          appId
        );
      }

      if (!accountId && !connectionId) {
        return respond(
          { success: false, error: 'accountId or connectionId is required.' },
          400,
          appId
        );
      }

      if (connectionId) {
        connection = await getLookupConnection({ appId, connectionId });
        if (!connection || connection.appId !== appId) {
          return respond(
            { success: false, error: 'connection_not_found' },
            404,
            appId
          );
        }
        targetAccountId = connection.accountId;
      }
    } else {
      // Browser/session integrations authenticate only through the auth_account cookie.
      lookupMode = 'authAccount';

      if (accountId || connectionId) {
        return respond(
          { success: false, error: 'accountId and connectionId are not allowed with auth_account cookie lookup.' },
          400,
          appId
        );
      }

      if (!authAccountToken) {
        return respond(
          { success: false, error: 'appSecret or auth_account cookie is required.' },
          401,
          appId
        );
      }

      const payload = await verifyAccountToken(authAccountToken);
      if (!payload?.aid || !payload?.sid || !payload?.skey) {
        return respond(
          { success: false, error: 'Invalid auth_account cookie.' },
          401,
          appId
        );
      }

      const session = await validateAuthSession({
        aid: payload.aid,
        sid: payload.sid,
        skey: payload.skey,
      });

      if (session.status !== 'valid') {
        return respond(
          { success: false, error: 'Invalid or expired signin session.' },
          401,
          appId
        );
      }

      targetAccountId = payload.aid;
    }

    if (!targetAccountId) {
      return respond(
        { success: false, error: 'accountId could not be resolved.' },
        400,
        appId
      );
    }

    const account = await getLookupAccount(targetAccountId);

    if (!account) {
      return respond(
        { success: false, error: 'Account not found.' },
        404,
        appId
      );
    }

    const party = [0, 1, 2, 3].includes(application.party) ? application.party : 1;

    // Party 2/3 app-secret callers may only inspect users actively registered with the app.
    const isRestrictedAppSecretLookup = lookupMode === 'appSecret' && (party === 2 || party === 3);
    const allowedFields = isRestrictedAppSecretLookup ? thirdPartyLookupFieldSet : lookupFieldSet;

    // Resolve the connection when available so connectionId can be returned and restrictions can be checked.
    if (!connection) {
      connection = await getLookupConnection({ appId, accountId: account.id });
    }

    if (isRestrictedAppSecretLookup && !connection) {
      return respond(
        { success: false, error: 'connection_not_found' },
        404,
        appId
      );
    }

    if (connection && connection.appId !== appId) {
      return respond(
        { success: false, error: 'connection_app_mismatch' },
        400,
        appId
      );
    }

    if (isRestrictedAppSecretLookup && connection?.status !== 'active') {
      return respond(
        { success: false, error: `connection_${connection?.status ?? 'not_found'}` },
        403,
        appId
      );
    }

    const selectedFields = selectFields(requestedFields, allowedFields);
    const lastActive = selectedFields.includes('lastActive') ? await getLatestActiveIso(account.id) : null;
    const profile = buildProfile({ account, connection, appId, lastActive, fields: selectedFields });

    return respond({
      success: true,
      profile,
    }, 200, appId);
  } catch (error) {
    await logError('auth', error, `accounts/lookup:${appId}`);
    return respond(
      { success: false, error: 'Internal server error.' },
      500,
      appId
    );
  }
}
