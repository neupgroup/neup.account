
import { NextResponse, type NextRequest } from 'next/server';
import { getUserProfile, getAccountPermission } from '@/services/user';
import { notFound } from 'next/navigation';
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions';

export async function GET(request: NextRequest) {
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
