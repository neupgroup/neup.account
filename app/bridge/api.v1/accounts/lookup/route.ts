import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { applicationAccessFields, type ApplicationAccessField } from '@/services/applications/types';

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
  if (hasDisallowedLocationInput(request)) {
    return NextResponse.json(
      { success: false, reason: 'invalid location used. use raw json to make request.' },
      { status: 400 }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { success: false, reason: 'invalid location used. use raw json to make request.' },
      { status: 400 }
    );
  }

  let appId: string | null = null;
  let appSecret: string | null = null;
  let accountId: string | null = null;

  try {
    const body = await request.json();
    appId = typeof body?.appId === 'string' ? body.appId.trim() : null;
    appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : null;
    accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : null;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (!appId || !appSecret) {
    return NextResponse.json(
      { success: false, error: 'appId and appSecret are required.' },
      { status: 400 }
    );
  }

  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'accountId is required.' },
      { status: 400 }
    );
  }

  try {
    const application = await prisma.application.findUnique({
      where: { id: appId },
      select: { id: true, appSecret: true, responseFields: true, tokenFields: true, details: true },
    });

    if (!application || application.appSecret !== appSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid application credentials.' },
        { status: 401 }
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
      return NextResponse.json(
        { success: false, error: 'Account not found.' },
        { status: 404 }
        );
      }

    const connection = await prisma.connection.findUnique({
      where: { accountId_appId: { accountId: account.id, appId } },
      select: { id: true, status: true },
    });

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error: 'connection_not_found',
        },
        { status: 404 }
      );
    }

    if (connection.status === 'invited') {
      return NextResponse.json(
        {
          success: false,
          error: 'connection_invited',
        },
        { status: 200 }
      );
    }

    if (connection.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `connection_${connection.status}` },
        { status: 200 }
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
      displayImage: account.displayImage ?? null,
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

    return NextResponse.json({
      success: true,
      profile,
      role: topRole,
      permissions: topPermission,
      access,
    });
  } catch (error) {
    await logError('auth', error, `accounts/lookup:${appId}`);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
