'use server';

// Performs a full session check — verifies the session, fetches the active account's
// profile and permissions, and returns everything the SessionProvider needs to hydrate.
// This is called on every page load by the client-side SessionProvider.

import { getUserProfile, getAccountPermission, getGrantedAccountPermission } from '@/services/user';
import type { StoredProfileInfo } from '@/inapp/auth/storage';
import { getAccountSelectorContext } from '@/services/account/accountSelector';
import { getActiveSession } from '@/services/account/verify';

export type SessionCheckResult =
    | { valid: false }
    | {
          valid: true;
          profileInfo: StoredProfileInfo;
          permissions: string[];
          accountId: string;
          personalAccountId: string;
      };

type CheckSessionOptions = {
    authAccountToken?: string | null;
};

// Verifies the active session and returns the profile, permissions, and account IDs.
// Returns { valid: false } if the session is invalid or the profile cannot be loaded.
export async function checkSession(selectedAccountId?: string | null, options: CheckSessionOptions = {}): Promise<SessionCheckResult> {
    const session = await getActiveSession({ authAccountToken: options.authAccountToken });
    if (!session) {
        return { valid: false };
    }

    // Resolve both the active (possibly managing) and personal account IDs in parallel
    const {
        activeAccountId: activeId,
        personalAccountId: personalId,
        isManagingOtherAccount,
    } = await getAccountSelectorContext(selectedAccountId);

    if (!activeId || !personalId) {
        return { valid: false };
    }

    // Fetch profile and permissions in parallel to minimize latency
    const [profile, permissions] = await Promise.all([
        getUserProfile(activeId),
        isManagingOtherAccount
            ? getGrantedAccountPermission(personalId, activeId)
            : getAccountPermission(activeId),
    ]);

    if (!profile) {
        return { valid: false };
    }

    return {
        valid: true,
        profileInfo: {
            firstName: profile.nameFirst,
            middleName: profile.nameMiddle,
            lastName: profile.nameLast,
            nameFirst: profile.nameFirst,
            nameMiddle: profile.nameMiddle,
            nameLast: profile.nameLast,
            nameDisplay: profile.nameDisplay,
            displayName: profile.displayName,
            neupId: profile.neupIdPrimary,
            neupIdPrimary: profile.neupIdPrimary,
            accountType: profile.accountType,
            accountPhoto: profile.accountPhoto,
            gender: profile.gender,
            verified: profile.verified,
        },
        permissions,
        accountId: activeId,
        personalAccountId: personalId,
    };
}
