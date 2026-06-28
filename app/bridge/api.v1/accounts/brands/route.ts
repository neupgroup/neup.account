import { NextResponse, type NextRequest } from 'next/server';
import { getActiveSession } from '@/core/auth/verify';
import { getAccessableBrandAccountsWithPermissions } from '@/services/manage/accounts';
import { resolveAppTokenAuth } from '@/services/auth/appTokenAuth';
import prisma from '@/core/helpers/prisma';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';

export const dynamic = 'force-dynamic';

const BRAND_CONNECTION_CREATE_PERMISSIONS = new Set([
    'brand.platforms.manage',
    'linked_accounts.brand.manage',
    'linked_accounts.brand.manager',
    'access.application.add',
    'access.application.add.managed',
]);

function normalizeKey(input: string): string {
    return input.replace(/[_-]/g, '').toLowerCase();
}

function readNormalizedBodyValue(body: Record<string, unknown>, canonical: string): string | null {
    const target = normalizeKey(canonical);
    for (const [key, value] of Object.entries(body)) {
        if (normalizeKey(key) !== target) continue;
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    return null;
}

async function resolveRequestAccountId(request: NextRequest): Promise<
    | { ok: true; accountId: string }
    | { ok: false; status: number; error: string }
> {
    const session = await getActiveSession();
    if (session?.accountId) {
        return { ok: true, accountId: session.accountId };
    }

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
        return { ok: false, status: resolved.status, error: resolved.error };
    }

    return { ok: true, accountId: resolved.accountId };
}

/**
 * GET /bridge/api.v1/accounts/brands
 *
 * Returns only the brand and branch accounts the caller has been granted
 * access to (accountType: 'brand' | 'branch'). Each account includes the
 * permissions the caller holds on that specific account.
 *
 * Auth:
 * - Same-domain session cookie via the active `auth_account` session, or
 * - Bearer app token in `Authorization: Bearer <token>` plus app secret in
 *   `x-app-secret`, `appSecret` header, or `?appSecret=...`
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
    const auth = await resolveRequestAccountId(_request);
    if (!auth.ok) {
        return NextResponse.json(
            { success: false, error: auth.error },
            { status: auth.status }
        );
    }

    const accounts = await getAccessableBrandAccountsWithPermissions(auth.accountId);

    return NextResponse.json({
        success: true,
        accounts,
    });
}

/**
 * POST /bridge/api.v1/accounts/brands
 *
 * Creates an application connection for a brand or branch account and returns
 * the resulting connection identifier. If the connection already exists, the
 * existing connection ID is returned.
 *
 * Caller auth:
 * - Same-domain session cookie via the active `auth_account` session, or
 * - Bearer app token in `Authorization: Bearer <token>` plus app secret in
 *   `x-app-secret`, `appSecret` header, or `?appSecret=...`
 *
 * Request body:
 * {
 *   appId: string;
 *   appSecret: string;
 *   accountId: string;
 * }
 *
 * Validation rules:
 * - `appId` and `appSecret` must match an active application
 * - `accountId` must belong to a `brand` or `branch` account
 * - the authenticated caller must already have access to that brand account
 * - the caller must hold at least one brand-level connection-management
 *   permission on that account before the connection can be created
 *
 * Success response:
 * {
 *   success: true,
 *   connectionId: string,
 *   status: string
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await resolveRequestAccountId(request);
    if (!auth.ok) {
        return NextResponse.json(
            { success: false, error: auth.error },
            { status: auth.status }
        );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
            { success: false, error: 'invalid_request', error_description: 'Request body must be valid JSON.' },
            { status: 400 }
        );
    }

    const payload = body as Record<string, unknown>;
    const appId = readNormalizedBodyValue(payload, 'appId');
    const appSecret = readNormalizedBodyValue(payload, 'appSecret');
    const accountId = readNormalizedBodyValue(payload, 'accountId');

    if (!appId) {
        return NextResponse.json(
            { success: false, error: 'invalid_request', error_description: 'appId is required.' },
            { status: 400 }
        );
    }

    if (!appSecret) {
        return NextResponse.json(
            { success: false, error: 'invalid_request', error_description: 'appSecret is required.' },
            { status: 400 }
        );
    }

    if (!accountId) {
        return NextResponse.json(
            { success: false, error: 'invalid_request', error_description: 'accountId is required.' },
            { status: 400 }
        );
    }

    const application = await prisma.application.findUnique({
        where: { id: appId },
        select: { id: true, appSecret: true, status: true },
    });

    if (!application) {
        return NextResponse.json(
            { success: false, error: 'application_not_found' },
            { status: 404 }
        );
    }

    if (!application.appSecret || application.appSecret !== appSecret) {
        return NextResponse.json(
            { success: false, error: 'invalid_app_secret' },
            { status: 401 }
        );
    }

    if (application.status === 'blocked' || application.status === 'rejected') {
        return NextResponse.json(
            { success: false, error: 'application_not_active' },
            { status: 403 }
        );
    }

    const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, accountType: true },
    });

    if (!account) {
        return NextResponse.json(
            { success: false, error: 'account_not_found' },
            { status: 404 }
        );
    }

    if (account.accountType !== 'brand' && account.accountType !== 'branch') {
        return NextResponse.json(
            {
                success: false,
                error: 'invalid_account_type',
                error_description: 'Only brand or branch accounts can be connected through this endpoint.',
            },
            { status: 400 }
        );
    }

    const accessibleBrands = await getAccessableBrandAccountsWithPermissions(auth.accountId);
    const targetBrand = accessibleBrands.find((entry) => entry.id === accountId);
    if (!targetBrand) {
        return NextResponse.json(
            {
                success: false,
                error: 'forbidden_brand_access',
                error_description: 'You do not have access to this brand account.',
            },
            { status: 403 }
        );
    }

    const canCreateConnection = targetBrand.permissions.some((permission) =>
        BRAND_CONNECTION_CREATE_PERMISSIONS.has(permission)
    );

    if (!canCreateConnection) {
        return NextResponse.json(
            {
                success: false,
                error: 'forbidden_brand_connection_create',
                error_description: 'You do not have permission to create a connection for this brand account.',
            },
            { status: 403 }
        );
    }

    const defaultRoleId = await getApplicationDefaultRoleId(appId);
    const connection = await prisma.connection.upsert({
        where: { accountId_appId: { accountId, appId } },
        update: {},
        create: {
            accountId,
            appId,
            status: 'active',
            roleId: defaultRoleId,
        },
        select: {
            id: true,
            status: true,
        },
    });

    return NextResponse.json({
        success: true,
        connectionId: connection.id,
        status: connection.status,
    });
}
