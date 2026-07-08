import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/logica/permission';
import { getUserProfile } from '@/services/user';
import { getActiveSession } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { notFound } from 'next/navigation';
import { getAccountPermission } from '@/services/user';
import { getProfileContacts, getProfileNeupIds } from '@/services/profile';
import { PROFILE_NAV_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions';

const routePermissions = [
    permission('profile.display.view.self', 'for_individual', 'default'),
    permission('profile.display.update.self', 'for_individual', 'default'),
    permission('profile.display.view.managed', 'for_individual'),
    permission('profile.display.update.managed', 'for_individual'),
    permission('profile.display.view.root', 'for_individual'),
    permission('profile.display.update.root', 'for_individual'),
    permission('profile.legal.view.self', 'for_individual'),
    permission('profile.legal.update.self', 'for_individual'),
    permission('profile.demographics.view.self', 'for_individual'),
    permission('profile.demographics.update.self', 'for_individual'),
    permission('profile.neupid.view.self', 'for_individual'),
    permission('profile.neupid.update.self', 'for_individual'),
    permission('profile.neupid.request.self', 'for_individual'),
    permission('profile.neupid.remove.self', 'for_individual'),
    permission('profile.contact.view.self', 'for_individual'),
    permission('profile.contact.update.self', 'for_individual'),
    permission('profile.kyc.view.self', 'for_individual'),
    permission('profile.kyc.update.self', 'for_individual'),
];

/**
 * ::neup.documentation::bridge-profile-signed-route-module
 * ::title Signed Profile Bridge Route Module
 *
 * Exposes the authenticated account's richer profile payload for signed clients.
 *
 * ::public
 *
 * This route returns a merged profile payload that includes core profile fields, contact fields, and the primary NeupID.
 *
 * ::public end
 *
 * ::private
 *
 * The route requires an active browser session and uses navigation-level profile permissions before returning the payload.
 *
 * ::private end
 *
 * ::end
 */
export async function POST(request: NextRequest) {
    /**
     * ::neup.documentation::bridge-profile-signed-post-endpoint
     * ::api POST /bridge/api.v1/profile/signed
     *
     * Returns the signed-in account's detailed profile payload.
     *
     * ::public
     *
     * Use this endpoint when a signed client needs the authenticated account's profile, contacts, legacy `name` compatibility object, and primary NeupID.
     *
     * ::public end
     *
     * ::private
     *
     * The route returns `401` for missing session, `404` when the profile record is missing, and `500` when downstream lookups fail.
     *
     * ::private end
     *
     * ::end
     */
    const session = await getActiveSession();

    if (!session) {
        return NextResponse.json({ success: false, error: 'Unauthenticated.' }, { status: 401 });
    }

    const permissions = await getAccountPermission();
    const canAccess = hasAnyPermission(permissions, PROFILE_NAV_PERMISSIONS);
    if (!canAccess) {
        notFound();
    }

    try {
        const [profile, contacts, neupIds] = await Promise.all([
            getUserProfile(session.accountId),
            getProfileContacts(session.accountId),
            getProfileNeupIds(session.accountId)
        ]);

        if (!profile) {
            return NextResponse.json({ success: false, error: 'Profile not found.' }, { status: 404 });
        }

        const primaryNeupId = neupIds && neupIds.length > 0 ? neupIds[0] : '';

        // Comprehensive profile including contacts and identity info
        const responseData = {
            ...profile,
            ...contacts,
            neupId: primaryNeupId,
            // Compatibility mapping for apps using legacy format
            name: {
                firstName: profile.nameFirst || '',
                lastname: profile.nameLast || ''
            },
            username: primaryNeupId,
            photo: profile.accountPhoto || ''
        };

        return NextResponse.json({
            success: true,
            profile: responseData
        });

    } catch (error) {
        await logError('database', error, 'signed');
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    /**
     * ::neup.documentation::bridge-profile-signed-get-endpoint
     * ::api GET /bridge/api.v1/profile/signed
     *
     * Returns the same signed profile payload as the POST variant.
     *
     * ::public
     *
     * This variant exists for callers that prefer a GET request but need the same authenticated profile contract.
     *
     * ::public end
     *
     * ::private
     *
     * The implementation delegates directly to `POST()` so both methods stay identical.
     *
     * ::private end
     *
     * ::end
     */
    return POST(request);
}
