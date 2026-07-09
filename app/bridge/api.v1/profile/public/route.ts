
import { NextResponse, type NextRequest } from 'next/server';
import { permission } from '@/logica/permission';
import { getUserProfile, getAccountPermission } from '@/services/user';
import { notFound } from 'next/navigation';
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/logica/account/profile-permissions';

const routePermissions = [
    permission('profile.display.view.self', 'for_individual', 'default'),
    permission('profile.display.update.self', 'for_individual', 'default'),
    permission('profile.display.view.managed', 'for_individual'),
    permission('profile.display.update.managed', 'for_individual'),
    permission('profile.display.view.root', 'for_individual'),
    permission('profile.display.update.root', 'for_individual'),
];

/**
 * ::neup.documentation::bridge-profile-public-route-module
 * ::title Public Profile Bridge Route Module
 *
 * Exposes a public-safe display profile snapshot for a requested account.
 *
 * ::public
 *
 * This route returns only display-safe profile fields such as display name and display photo.
 *
 * ::public end
 *
 * ::private
 *
 * Access still requires display-profile permission checks through `PROFILE_SECTION_PERMISSIONS.display`.
 *
 * ::private end
 *
 * ::end
 */
export async function GET(request: NextRequest) {
    /**
     * ::neup.documentation::bridge-profile-public-endpoint
     * ::api GET /bridge/api.v1/profile/public
     *
     * Returns the public-facing display profile for one account ID.
     *
     * ::public
     *
     * Send `accountId` as a query parameter to fetch the display name and display photo for that account.
     *
     * ::public end
     *
     * ::private
     *
     * Missing `accountId` returns `400`, missing profiles return `404`, and permission failures resolve through `notFound()`.
     *
     * ::private end
     *
     * ::param external accountId
     * ::datatype string
     * ::required true
     *
     * Account identifier to resolve.
     *
     * ::end
     */
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
        return NextResponse.json({ success: false, error: 'accountId is required.' }, { status: 400 });
    }

    const permissions = await getAccountPermission();
    const canAccess = hasAnyPermission(permissions, PROFILE_SECTION_PERMISSIONS.display);
    if (!canAccess) {
        notFound();
    }
    
    try {
        const profile = await getUserProfile(accountId);

        if (!profile) {
            return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
        }

        // Return only publicly safe information
        const publicProfile = {
            accountId: accountId,
            displayName: profile.nameDisplay || `${profile.nameFirst || ''} ${profile.nameLast || ''}`.trim(),
            displayPhoto: profile.accountPhoto,
        };

        return NextResponse.json({
            success: true,
            profile: publicProfile
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
