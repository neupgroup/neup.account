import { NextResponse, type NextRequest } from 'next/server';
import { getActiveSession } from '@/core/auth/verify';
import { getAccessableBrandAccountsWithPermissions } from '@/services/manage/accounts';
import { resolveAppTokenAuth } from '@/services/auth/appTokenAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /bridge/api.v1/accounts/brands
 *
 * Returns only the brand and branch accounts the authenticated user
 * has been granted access to (accountType: 'brand' | 'branch').
 * Each account includes the permissions the caller holds on it.
 *
 * Response shape:
 * {
 *   success: true,
 *   accounts: Array<{
 *     id: string;
 *     displayName: string | null;
 *     displayImage: string | null;
 *     status: string | null;
 *     isVerified: boolean;
 *     accountType: string;
 *     permissions: string[];
 *   }>
 * }
 */
export async function GET(_request: NextRequest) {
    const session = await getActiveSession();
    let accountId: string | null = session?.accountId ?? null;

    if (!accountId) {
        const authorization = _request.headers.get('authorization') ?? '';
        const token = authorization.toLowerCase().startsWith('bearer ')
            ? authorization.slice('bearer '.length).trim()
            : null;

        const url = new URL(_request.url);
        const appSecret =
            _request.headers.get('x-app-secret') ??
            _request.headers.get('appSecret') ??
            url.searchParams.get('appSecret');

        const resolved = await resolveAppTokenAuth({ token, appSecret });
        if (!resolved.ok) {
            return NextResponse.json(
                { success: false, error: resolved.error },
                { status: resolved.status }
            );
        }

        accountId = resolved.accountId;
    }

    const accounts = await getAccessableBrandAccountsWithPermissions(accountId);

    return NextResponse.json({
        success: true,
        accounts,
    });
}
