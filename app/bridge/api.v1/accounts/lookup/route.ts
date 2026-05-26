import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

export const dynamic = 'force-dynamic';

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
      select: { id: true, appSecret: true },
    });

    if (!application || application.appSecret !== appSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid application credentials.' },
        { status: 401 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        displayName: true,
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

    return NextResponse.json({
      success: true,
      profile: {
        displayName: account.displayName,
        primaryNeupId: account.neupIds[0]?.neupId ?? null,
        connectionId: connection.id,
        accountId: account.id,
      },
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
