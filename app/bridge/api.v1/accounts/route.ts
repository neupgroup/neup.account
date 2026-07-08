import { NextResponse, type NextRequest } from 'next/server';
import { getActiveSession } from '@/core/auth/verify';
import { getAccessableAccountsWithPermissions } from '@/services/manage/accounts';
import { resolveAppTokenAuth } from '@/services/auth/appTokenAuth';
import prisma from '@/core/helpers/prisma';
import { getApplicationDefaultRoleId } from '@/services/applications/default-role';
import { permission, type PermissionDeclaration } from '@/logica/permission';

export const dynamic = 'force-dynamic';

const ACCOUNT_CONNECTION_CREATE_PERMISSIONS: Record<string, readonly PermissionDeclaration[]> = {
    individual: [
        permission('access.connection.create.individual.self', 'for_individual'),
        permission('access.connection.create.individual.managed', 'for_individual'),
        permission('access.connection.create.individual.root', 'for_individual'),
        permission('access.application.add.self', 'for_individual'),
        permission('access.application.add.managed', 'for_individual'),
        permission('access.application.add.root', 'for_individual'),
    ],
    brand: [
        permission('access.connection.create.brand.self', 'for_brand'),
        permission('access.connection.create.brand.managed', 'for_brand'),
        permission('access.connection.create.brand.root', 'for_brand'),
        permission('brand.platforms.manage', 'for_brand'),
        permission('linked_accounts.brand.manage', 'for_brand', 'brand'),
        permission('linked_accounts.brand.manager', 'for_brand', 'brand'),
        permission('access.application.add.self', 'for_individual'),
        permission('access.application.add.managed', 'for_individual'),
        permission('access.application.add.root', 'for_individual'),
    ],
    subbrand: [
        permission('access.connection.create.brand.self', 'for_brand'),
        permission('access.connection.create.brand.managed', 'for_brand'),
        permission('access.connection.create.brand.root', 'for_brand'),
        permission('brand.platforms.manage', 'for_brand'),
        permission('linked_accounts.brand.manage', 'for_brand', 'brand'),
        permission('linked_accounts.brand.manager', 'for_brand', 'brand'),
        permission('access.application.add.self', 'for_individual'),
        permission('access.application.add.managed', 'for_individual'),
        permission('access.application.add.root', 'for_individual'),
    ],
    branch: [
        permission('access.connection.create.brand.self', 'for_brand'),
        permission('access.connection.create.brand.managed', 'for_brand'),
        permission('access.connection.create.brand.root', 'for_brand'),
        permission('brand.platforms.manage', 'for_brand'),
        permission('linked_accounts.brand.manage', 'for_brand', 'brand'),
        permission('linked_accounts.brand.manager', 'for_brand', 'brand'),
        permission('access.application.add.self', 'for_individual'),
        permission('access.application.add.managed', 'for_individual'),
        permission('access.application.add.root', 'for_individual'),
    ],
    dependent: [
        permission('access.connection.create.dependent.self', 'for_individual'),
        permission('access.connection.create.dependent.managed', 'for_individual'),
        permission('access.connection.create.dependent.root', 'for_individual'),
        permission('access.application.add.self', 'for_individual'),
        permission('access.application.add.managed', 'for_individual'),
        permission('access.application.add.root', 'for_individual'),
    ],
};

/**
 * ::neup.documentation::bridge-accounts-route-module
 * ::title Bridge Accounts Route Module
 *
 * Exposes account-listing and connection-creation endpoints for bridge clients.
 *
 * ::public
 *
 * This route lets authenticated callers list accessible accounts that can create application connections, then create or reuse a connection for one selected account.
 *
 * ::public end
 *
 * ::private
 *
 * Browser-session auth and app-token auth are both supported here, but the route still delegates account visibility and application validation to service and data layers.
 *
 * ::private end
 *
 * ::end
 */
function normalizeKey(input: string): string {
    /**
     * ::neup.documentation::bridge-accounts-route-normalize-key
     * ::function normalizeKey(input)
     *
     * Normalizes request-field names for tolerant body parsing.
     *
     * ::public
     *
     * Removes dashes and underscores and lowercases the result so equivalent key spellings can be treated the same.
     *
     * ::public end
     *
     * ::private
     *
     * This is used only for body-field alias matching; it does not change any persisted identifier values.
     *
     * ::private end
     *
     * ::end
     */
    return input.replace(/[_-]/g, '').toLowerCase();
}

function readNormalizedBodyValue(body: Record<string, unknown>, canonical: string): string | null {
    /**
     * ::neup.documentation::bridge-accounts-route-read-normalized-body-value
     * ::function readNormalizedBodyValue(body, canonical)
     *
     * Reads one string body field using tolerant key matching.
     *
     * ::public
     *
     * Accepts alternate key spellings such as `app_id`, `app-id`, or `appId` and returns a trimmed non-empty string when present.
     *
     * ::public end
     *
     * ::private
     *
     * Non-string values are rejected so downstream validation can treat them as missing input.
     *
     * ::private end
     *
     * ::end
     */
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
    /**
     * ::neup.documentation::bridge-accounts-route-can-create-connection-for-account
     * ::function canCreateConnectionForAccount(account)
     *
     * Checks whether one accessible account has the permissions required to create an application connection.
     *
     * ::public
     *
     * The decision is based on the target account type and the effective permissions granted on that account.
     *
     * ::public end
     *
     * ::private
     *
     * The permission matrix is kept local to this route because it defines the external bridge contract for who may establish connections.
     *
     * ::private end
     *
     * ::end
     */
    const allowedPermissions = ACCOUNT_CONNECTION_CREATE_PERMISSIONS[account.accountType];
    if (!allowedPermissions || allowedPermissions.length === 0) {
        return false;
    }

    return account.permissions.some((permission) =>
        allowedPermissions.some((allowedPermission) => allowedPermission.id === permission),
    );
}

/**
 * ::neup.documentation::bridge-accounts-get-endpoint
 * ::api GET /bridge/api.v1/accounts
 *
 * Returns the accessible accounts that may create an application connection.
 *
 * ::public
 *
 * Use this endpoint to populate an account picker for bridge connection setup. Each account in the response includes the effective permission IDs held by the authenticated caller.
 *
 * ::public end
 *
 * ::private
 *
 * The route authenticates either from the active browser session or from an app bearer token plus `appSecret`, then filters the accessible-account set by connection-creation eligibility.
 *
 * ::private end
 *
 * ::details
 *
 * Success responses return `200`. App-token failures return the non-200 status produced by `resolveAppTokenAuth()`.
 *
 * ::end
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
 * ::neup.documentation::bridge-accounts-post-endpoint
 * ::api POST /bridge/api.v1/accounts
 *
 * Creates or reuses an application connection for one accessible account.
 *
 * ::public
 *
 * Send `appId`, `appSecret`, and `accountId` in the JSON body to establish the account-to-application connection and receive its connection ID.
 *
 * ::public end
 *
 * ::private
 *
 * This endpoint requires an active browser session, validates the target application and secret, confirms delegated access to the requested account, then upserts the connection row with the app's default role.
 *
 * ::private end
 *
 * ::param external appId
 * ::datatype string
 * ::required true
 *
 * Application identifier to connect to.
 *
 * ::param external appSecret
 * ::datatype string
 * ::required true
 *
 * Shared secret for the target application.
 *
 * ::param external accountId
 * ::datatype string
 * ::required true
 *
 * Accessible account identifier to connect on behalf of.
 *
 * ::details
 *
 * This route returns `401` for missing session or invalid app secret, `403` for inaccessible or unauthorized accounts, `404` when the application does not exist, and `200` on success.
 *
 * ::end
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
