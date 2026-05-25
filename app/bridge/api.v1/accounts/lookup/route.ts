import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/core/helpers/prisma';
import { logError } from '@/core/helpers/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /account/bridge/api.v1/accounts/lookup
 *
 * Looks up basic public profile information for an account.
 *
 * The caller must identify themselves as a registered application by passing
 * appId and appSecret as query parameters. Requests without valid credentials
 * are rejected with 401.
 *
 * On a successful lookup, an ApplicationConnection is automatically created
 * (or confirmed) between the looked-up account and the calling application.
 * This records that the app has accessed this account's profile.
 *
 * Query params:
 *   appId     — (required) the application ID
 *   appSecret — (required) the application secret
 *   accountId — the account UUID  (one of accountId or neupId required)
 *   neupId    — the NeupID handle (one of accountId or neupId required)
 *
 * Response (200):
 * {
 *   success: true,
 *   account: {
 *     accountId:    string
 *     displayName:  string | null
 *     displayImage: string | null
 *     accountType:  string
 *     neupId:       string | null
 *   }
 * }
 *
 * Errors: 400 (missing params), 401 (invalid app credentials), 404 (account not found), 500
 */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;

    const appId     = searchParams.get('appId')?.trim()     || null;
    const appSecret = searchParams.get('appSecret')?.trim() || null;
    const accountId = searchParams.get('accountId')?.trim() || null;
    const neupId    = searchParams.get('neupId')?.trim()    || null;

    // 1. Require app credentials
    if (!appId || !appSecret) {
        return NextResponse.json(
            { success: false, error: 'appId and appSecret are required.' },
            { status: 400 }
        );
    }

    // 2. Require at least one lookup key
    if (!accountId && !neupId) {
        return NextResponse.json(
            { success: false, error: 'Provide either accountId or neupId.' },
            { status: 400 }
        );
    }

    try {
        // 3. Validate app credentials
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

        // 4. Resolve accountId from neupId if needed
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

        // 5. Fetch account
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

        // 6. Auto-create ApplicationConnection (upsert — safe to call repeatedly)
        await prisma.connection.upsert({
            where: { accountId_appId: { accountId: account.id, appId } },
            update: {},
            create: { accountId: account.id, appId, status: 'active' },
        });

        return NextResponse.json({
            success: true,
            account: {
                accountId:    account.id,
                displayName:  account.displayName,
                displayImage: account.displayImage,
                accountType:  account.accountType,
                neupId:       account.neupIds[0]?.id ?? null,
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
