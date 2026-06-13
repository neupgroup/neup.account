import { NextResponse, type NextRequest } from 'next/server';
import { getUserProfile } from '@/services/user';
import { getActiveSession } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { notFound } from 'next/navigation';
import { getAccountPermission } from '@/services/user';
import { getProfileContacts, getProfileNeupIds } from '@/services/profile';
import { PROFILE_NAV_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions';

export async function POST(request: NextRequest) {
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
    return POST(request);
}
