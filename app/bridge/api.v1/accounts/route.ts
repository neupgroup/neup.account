import { NextResponse, type NextRequest } from 'next/server';
import { getActiveSession } from '@/core/auth/verify';
import { getAccessableAccountsWithPermissions } from '@/services/manage/accounts';
import { resolveAppTokenAuth } from '@/services/auth/appTokenAuth';
import prisma from '@/core/helpers/prisma';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';

export const dynamic = 'force-dynamic';

const ACCOUNT_CONNECTION_CREATE_PERMISSIONS: Record<string, readonly string[]> = {
    individual: [
        'access.connection.create.individual.self',
        'access.connection.create.individual.managed',
        'access.connection.create.individual.root',
        'access.application.add.self',
        'access.application.add.managed',
        'access.application.add.root',
    ],
    brand: [
        'access.connection.create.brand.self',
        'access.connection.create.brand.managed',
        'access.connection.create.brand.root',
        'brand.platforms.manage',
        'linked_accounts.brand.manage',
        'linked_accounts.brand.manager',
        'access.application.add.self',
        'access.application.add.managed',
        'access.application.add.root',
    ],
    subbrand: [
        'access.connection.create.brand.self',
        'access.connection.create.brand.managed',
        'access.connection.create.brand.root',
        'brand.platforms.manage',
        'linked_accounts.brand.manage',
        'linked_accounts.brand.manager',
        'access.application.add.self',
        'access.application.add.managed',
        'access.application.add.root',
    ],
    branch: [
        'access.connection.create.brand.self',
        'access.connection.create.brand.managed',
        'access.connection.create.brand.root',
        'brand.platforms.manage',
        'linked_accounts.brand.manage',
        'linked_accounts.brand.manager',
        'access.application.add.self',
        'access.application.add.managed',
        'access.application.add.root',
    ],
    dependent: [
        'access.connection.create.dependent.self',
        'access.connection.create.dependent.managed',
        'access.connection.create.dependent.root',
        'access.application.add.self',
        'access.application.add.managed',
        'access.application.add.root',
    ],
};

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

function canCreateConnectionForAccount(account: {
    accountType: string;
    permissions: string[];
}): boolean {
    const allowedPermissions = ACCOUNT_CONNECTION_CREATE_PERMISSIONS[account.accountType];
    if (!allowedPermissions || allowedPermissions.length === 0) {
        return false;
    }

    return account.permissions.some((permission) => allowedPermissions.includes(permission));
}

/**
 * GET /bridge/api.v1/accounts
 *
 * Returns all accounts the authenticated user has been granted access to and
 * can create an application connection for, including brand, subbrand,
 * dependent, and any other delegated accounts.
 * Each account includes the permissions the caller holds on it.
 *
 * Response shape:
 * {
 *   success: true,
 *   accounts: Array<{
 *     id: string;
 *     type: string;
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

    const accounts = (await getAccessableAccountsWithPermissions(accountId))
        .filter((account) => canCreateConnectionForAccount(account));

    return NextResponse.json({
        success: true,
        accounts,
    });
}

/**
 * POST /bridge/api.v1/accounts
 *
 * Creates an application connection for an accessible account and returns the
 * resulting connection identifier. If the connection already exists, the
 * existing connection ID is returned.
 *
 * Caller auth:
 * - Same-domain session cookie via the active `auth_account` session
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
 * - `accountId` must belong to an accessible account
 * - the authenticated caller must hold the account-type-specific connection
 *   creation permission for the target account
 *
 * Success response:
 * {
 *   success: true,
 *   connectionId: string,
 *   status: string
 * }
 */
export async function POST(request: NextRequest) {
    const session = await getActiveSession();
    const requesterAccountId = session?.accountId ?? null;
    if (!requesterAccountId) {
        return NextResponse.json(
            { success: false, error: 'Active auth_account session is required.' },
            { status: 401 }
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

    const accessibleAccounts = await getAccessableAccountsWithPermissions(requesterAccountId);
    const targetAccount = accessibleAccounts.find((entry) => entry.id === accountId);
    if (!targetAccount) {
        return NextResponse.json(
            {
                success: false,
                error: 'forbidden_account_access',
                error_description: 'You do not have access to this account.',
            },
            { status: 403 }
        );
    }

    if (!canCreateConnectionForAccount(targetAccount)) {
        return NextResponse.json(
            {
                success: false,
                error: 'forbidden_account_connection_create',
                error_description: 'You do not have permission to create a connection for this account.',
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
