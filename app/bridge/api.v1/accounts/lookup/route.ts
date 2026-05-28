import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { applicationAccessFields, type ApplicationAccessField } from '@/services/applications/types';
import { writeApplicationDevLog } from '@/services/bridge/dev-logs';

export const dynamic = 'force-dynamic';
const accessFieldSet = new Set<ApplicationAccessField>(applicationAccessFields);

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
  if (q.has('accountId') || q.has('appId') || q.has('appSecret')) {
    return true;
  }

  // Reject if sent via headers (case-insensitive)
  const headerKeys = ['accountid', 'appid', 'appsecret'];
  for (const key of headerKeys) {
    if (request.headers.get(key) !== null) {
      return true;
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  let requestBodyForLog: Record<string, unknown> | null = null;

  const respond = async (payload: Record<string, unknown>, status: number, appIdForLog?: string | null) => {
    await writeApplicationDevLog({
      appId: appIdForLog ?? (typeof requestBodyForLog?.appId === 'string' ? requestBodyForLog.appId : null),
      endpoint: '/bridge/api.v1/accounts/lookup',
      method: 'POST',
      request,
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

  try {
    const body = await request.json();
    requestBodyForLog = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    appId = typeof body?.appId === 'string' ? body.appId.trim() : null;
    appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : null;
    accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : null;
  } catch {
    return respond(
      { success: false, error: 'Invalid JSON body.' },
      400,
      appId
    );
  }

  if (!appId || !appSecret) {
    return respond(
      { success: false, error: 'appId and appSecret are required.' },
      400,
      appId
    );
  }

  if (!accountId) {
    return respond(
      { success: false, error: 'accountId is required.' },
      400,
      appId
    );
  }

  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true, appSecret: true, responseFields: true, tokenFields: true, details: true },
    });

    if (!application || application.appSecret !== appSecret) {
      return respond(
        { success: false, error: 'Invalid application credentials.' },
        401,
        appId
      );
    }

    const legacyDetails =
      application.details && typeof application.details === 'object'
        ? (application.details as Record<string, unknown>)
        : {};

    const configuredResponse = Array.isArray(application.responseFields) ? application.responseFields : [];
    const configuredToken = Array.isArray(application.tokenFields)
      ? application.tokenFields
      : Array.isArray((legacyDetails as any).token_fields)
        ? ((legacyDetails as any).token_fields as unknown[])
        : [];
    const configuredLegacyAccess = Array.isArray((legacyDetails as any).access)
      ? ((legacyDetails as any).access as unknown[])
      : [];

    const configuredFields = Array.from(
      new Set(
        [...configuredResponse, ...configuredToken, ...configuredLegacyAccess]
          .filter((field): field is ApplicationAccessField => typeof field === 'string' && accessFieldSet.has(field as ApplicationAccessField))
      )
    );

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        displayName: true,
        displayImage: true,
        accountType: true,
        details: true,
        individualProfile: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            dateOfBirth: true,
            details: true,
          },
        },
        neupIds: {
          where: { isPrimary: true },
          select: { neupId: true },
          take: 1,
        },
      },
    });

    if (!account) {
      return respond(
        { success: false, error: 'Account not found.' },
        404,
        appId
      );
      }

    const connection = await prisma.connection.findUnique({
      where: { accountId_appId: { accountId: account.id, appId } },
      select: { id: true, status: true },
    });

    if (!connection) {
      return respond(
        {
          success: false,
          error: 'connection_not_found',
        },
        404,
        appId
      );
    }

    if (connection.status === 'invited') {
      return respond(
        {
          success: false,
          error: 'connection_invited',
        },
        200,
        appId
      );
    }

    if (connection.status !== 'active') {
      return respond(
        { success: false, error: `connection_${connection.status}` },
        200,
        appId
      );
    }

    const latestSession = await prisma.authnSession.findFirst({
      where: { accountId: account.id },
      orderBy: { lastLoggedIn: 'desc' },
      select: { lastLoggedIn: true },
    });

    const grants = await prisma.member.findMany({
      where: {
        memberId: account.id,
        accessFor: 'account',
        status: 'active',
        parentApplicationId: appId,
      },
      select: {
        accessTo: true,
        parentPortfolioId: true,
        role: {
          select: {
            name: true,
            permissions: true,
          },
        },
      },
    });

    const access = grants.map((grant) => {
      const rolePermissions = Array.isArray(grant.role.permissions)
        ? grant.role.permissions.filter((item): item is string => typeof item === 'string')
        : [];

      return {
        accessOf: grant.accessTo,
        role: grant.role.name,
        permissions: rolePermissions,
        ...(grant.parentPortfolioId ? { portfolio: grant.parentPortfolioId } : {}),
      };
    });

    const selfAccess = access.filter((entry) => entry.accessOf === account.id);
    const topRole = selfAccess[0]?.role ?? null;
    const topPermission = Array.from(
      new Set(selfAccess.flatMap((entry) => entry.permissions))
    );

    const accountDetails = account.details && typeof account.details === 'object'
      ? (account.details as Record<string, unknown>)
      : {};
    const nestedProfile =
      accountDetails.profile && typeof accountDetails.profile === 'object'
        ? (accountDetails.profile as Record<string, unknown>)
        : {};
    const individualDetails = account.individualProfile?.details && typeof account.individualProfile.details === 'object'
      ? (account.individualProfile.details as Record<string, unknown>)
      : {};

    const dob = account.individualProfile?.dateOfBirth ?? null;
    const now = new Date();
    const age =
      dob
        ? now.getUTCFullYear() - dob.getUTCFullYear() - (
            now.getUTCMonth() < dob.getUTCMonth() ||
            (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
              ? 1
              : 0
          )
        : null;
    const isMinor = typeof age === 'number' ? age < 18 : null;
    const gender =
      (typeof accountDetails.gender === 'string' && accountDetails.gender) ||
      (typeof individualDetails.gender === 'string' && individualDetails.gender) ||
      null;
    const lastActiveIso = latestSession?.lastLoggedIn?.toISOString() ?? null;
    const primaryNeupId = account.neupIds[0]?.neupId ?? null;

    const valueByField: Record<ApplicationAccessField, unknown> = {
      connectionId: connection.id,
      accountId: account.id,
      displayName: account.displayName ?? null,
      displayImage:
        (typeof nestedProfile.displayImage === 'string' && nestedProfile.displayImage.trim().length > 0
          ? nestedProfile.displayImage.trim()
          : null) ?? account.displayImage ?? null,
      accountType: account.accountType ?? null,
      lastActive: lastActiveIso,
      neupid: primaryNeupId,
      firstName: account.individualProfile?.firstName ?? null,
      lastName: account.individualProfile?.lastName ?? null,
      middleName: account.individualProfile?.middleName ?? null,
      dateBirth: dob ? dob.toISOString() : null,
      age,
      isMinor,
      gender,
    };

    const profile: Record<string, unknown> = {};
    for (const field of configuredFields) {
      profile[field] = valueByField[field];
    }

    return respond({
      success: true,
      profile,
      role: topRole,
      permissions: topPermission,
      access,
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
