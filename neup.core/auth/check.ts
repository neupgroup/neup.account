'use server';

// Performs a full session check — verifies the session, fetches the active account's
// profile and permissions, and returns everything the SessionProvider needs to hydrate.
// This is called on every page load by the client-side SessionProvider.

import { getUserProfile, getAccountPermission, getGrantedAccountPermission } from '@/services/user';
import type { StoredProfileInfo } from './storage';
import { getAccountSelectorContext } from '@/neup.core/auth/accountSelector';
import { getActiveSession } from '@/neup.core/auth/verify';

export type SessionCheckResult =
    | { valid: false }
    | {
          valid: true;
          profileInfo: StoredProfileInfo;
          permissions: string[];
          accountId: string;
          personalAccountId: string;
      };

// Verifies the active session and returns the profile, permissions, and account IDs.
// Returns { valid: false } if the session is invalid or the profile cannot be loaded.
export async function checkSession(selectedAccountId?: string | null): Promise<SessionCheckResult> {
    const session = await getActiveSession();
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
            lastName: profile.nameLast,
            neupId: profile.neupIdPrimary,
            accountType: profile.accountType,
        },
        permissions,
        accountId: activeId,
        personalAccountId: personalId,
    };
}
