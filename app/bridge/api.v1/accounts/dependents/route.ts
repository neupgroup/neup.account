import { NextResponse, type NextRequest } from 'next/server';
import { getActiveSession } from '@/core/auth/verify';
import { getAccessableAccountsWithPermissions } from '@/services/manage/accounts';
import { resolveAppTokenAuth } from '@/services/auth/appTokenAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /bridge/api.v1/accounts/dependents
 *
 * Returns only the dependent accounts the authenticated user has been granted
 * access to (accountType: 'dependent'). Each account includes the permissions
 * the caller holds on it.
 *
 * Supports two auth modes:
 * - Cookie session (same-domain apps)
 * - External app token + appSecret (server-to-server)
 */
export async function GET(request: NextRequest) {
  const session = await getActiveSession();
  let accountId: string | null = session?.accountId ?? null;

  if (!accountId) {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice('bearer '.length).trim()
      : null;

    const url = new URL(request.url);
    const appSecret =
      request.headers.get('x-app-secret') ??
      request.headers.get('appSecret') ??
      url.searchParams.get('appSecret');

    const resolved = await resolveAppTokenAuth({ token, appSecret });
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: resolved.status });
    }

    accountId = resolved.accountId;
  }

  const accounts = await getAccessableAccountsWithPermissions(accountId);
  const dependents = accounts.filter((a) => a.accountType === 'dependent');

  return NextResponse.json({ success: true, accounts: dependents });
}

