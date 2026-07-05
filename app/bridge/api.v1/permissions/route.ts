import { NextResponse, type NextRequest } from 'next/server';
import { getAccountPermission } from '@/services/user';
import { getActiveSession } from '@/neup.core/auth/verify';

/**
 * ::neup.documentation::bridge-permissions-route-module
 * ::title Bridge Permissions Route Module
 *
 * Exposes the current signed-in account permission snapshot for bridge clients.
 *
 * ::public
 *
 * This route returns the effective Neup Account permission IDs for the active browser session.
 *
 * ::public end
 *
 * ::private
 *
 * Authentication is session-only here. Permission resolution is delegated to `services/user.ts`.
 *
 * ::private end
 *
 * ::end
 */
export async function GET(request: NextRequest) {
    /**
     * ::neup.documentation::bridge-permissions-endpoint
     * ::api GET /bridge/api.v1/permissions
     *
     * Returns the current session account's effective permission IDs.
     *
     * ::public
     *
     * Use this endpoint when a first-party client needs the active permission snapshot after sign-in or account switching.
     *
     * ::public end
     *
     * ::private
     *
     * The route returns `401` when there is no active session and `200` on success.
     *
     * ::private end
     *
     * ::end
     */
    const session = await getActiveSession();

    if (!session) {
        return NextResponse.json({ success: false, error: 'Unauthenticated.' }, { status: 401 });
    }

    const permissions = await getAccountPermission(session.accountId);

    return NextResponse.json({
        success: true,
        permissions,
    });
}
