import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';
import { verifyAccountToken } from '@/core/auth/accountToken';

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

async function isValidSession(aid: string, sid: string, skey: string): Promise<boolean> {
  const session = await prisma.authnSession.findUnique({
    where: { id: sid },
    select: { accountId: true, key: true, validTill: true },
  });

  return (
    !!session &&
    session.accountId === aid &&
    session.key === skey &&
    !!session.validTill &&
    session.validTill > new Date()
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
  let neupId: string | null = null;

  try {
    const body = await request.json();
    appId = typeof body?.appId === 'string' ? body.appId.trim() : null;
    appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : null;
    accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : null;
    neupId = typeof body?.neupId === 'string' ? body.neupId.trim() : null;
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

  if (!accountId && !neupId) {
    return NextResponse.json(
      { success: false, error: 'Provide either accountId or neupId.' },
      { status: 400 }
    );
  }

  try {
    const rawCookieToken = request.cookies.get('auth_account')?.value?.trim();
    if (!rawCookieToken) {
      return NextResponse.json(
        { success: false, reason: 'missing auth_account cookie' },
        { status: 401 }
      );
    }

    const payload = await verifyAccountToken(rawCookieToken);
    if (!payload?.aid || !payload?.sid || !payload?.skey) {
      return NextResponse.json(
        { success: false, reason: 'invalid auth_account token' },
        { status: 401 }
      );
    }

    const sessionValid = await isValidSession(payload.aid, payload.sid, payload.skey);
    if (!sessionValid) {
      return NextResponse.json(
        { success: false, reason: 'invalid session' },
        { status: 401 }
      );
    }

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

    let resolvedAccountId: string | null = accountId;

    if (!resolvedAccountId && neupId) {
      const neupRecord = await prisma.neupId.findUnique({
        where: { id: neupId.toLowerCase() },
        select: { accountId: true },
      });

      if (!neupRecord) {
        return NextResponse.json(
          { success: false, error: 'Account not found.' },
          { status: 404 }
        );
      }

      resolvedAccountId = neupRecord.accountId;
    }

    const account = await prisma.account.findUnique({
      where: { id: resolvedAccountId! },
      select: {
        id: true,
        displayName: true,
        displayImage: true,
        accountType: true,
        neupIds: {
          where: { isPrimary: true },
          select: { id: true },
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

    const connection = await prisma.connection.upsert({
      where: { accountId_appId: { accountId: account.id, appId } },
      update: {},
      create: { accountId: account.id, appId, status: 'active' },
      select: { id: true, status: true },
    });

    if (connection.status === 'invited') {
      return NextResponse.json(
        {
          success: false,
          reason: 'the user has been invited to platform, still not part of this application.',
        },
        { status: 200 }
      );
    }

    if (connection.status !== 'active') {
      return NextResponse.json(
        { success: false, reason: `connection is ${connection.status}` },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      signup: true,
      account: {
        accountId: account.id,
        displayName: account.displayName,
        displayImage: account.displayImage,
        accountType: account.accountType,
        neupId: account.neupIds[0]?.id ?? null,
      },
    });
  } catch (error) {
    await logError('auth', error, `accounts/lookup:${appId}`);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
