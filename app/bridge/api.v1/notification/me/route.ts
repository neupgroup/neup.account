import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/.neup/core/database/prisma';
import { getActiveSession } from '@/services/account/verify';

export const dynamic = 'force-dynamic';

function tokenFromRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  return request.headers.get('x-auth-account')
    ?? request.headers.get('auth-account')
    ?? authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?? null;
}

async function accountId(request: NextRequest) {
  const session = await getActiveSession({ authAccountToken: tokenFromRequest(request) });
  return session?.accountId ?? null;
}

export async function GET(request: NextRequest) {
  const id = await accountId(request);
  if (!id) return NextResponse.json({ success: false, error: 'notification.auth.invalid' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { accountId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, notifications });
}

export async function PATCH(request: NextRequest) {
  const id = await accountId(request);
  if (!id) return NextResponse.json({ success: false, error: 'notification.auth.invalid' }, { status: 401 });

  let body: { notificationId?: string; id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'notification.request.invalid' }, { status: 400 }); }
  const notificationId = body.notificationId ?? body.id;
  if (!notificationId) return NextResponse.json({ success: false, error: 'notification.id.empty' }, { status: 400 });

  const result = await prisma.notification.updateMany({
    where: { id: notificationId, accountId: id },
    data: { read: true },
  });
  if (!result.count) return NextResponse.json({ success: false, error: 'notification.not_found' }, { status: 404 });
  return NextResponse.json({ success: true, notificationId, read: true });
}
