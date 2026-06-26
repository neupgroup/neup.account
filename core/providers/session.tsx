"use client";

// Provides the active session state to the entire component tree.
// On mount, calls checkSession() to verify the session and load the profile and permissions.
// Caches a lightweight profile snapshot and permissions JSON in sessionStorage to avoid
// redundant server calls on subsequent renders. Cache is invalidated on refetch().

import { createContext, useState, useEffect, type ReactNode, useContext, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { type UserProfile, getUserProfile as fetchUserProfile } from '@/services/user';
import { checkSession } from '@/core/auth/check';
import { AUTH_STATE_CHANGED_EVENT } from '@/core/auth/events';
import {
    getSessionData,
    setSessionData,
    deleteSessionData,
    PROFILE_INFO_KEY,
    JWT_KEY,
} from '@/core/auth/storage';

type SessionState = {
    loading: boolean;
    profile: UserProfile | null;
    permissions: string[] | null;
    accountId: string | null;
    personalAccountId: string | null;
    isManaging: boolean; // true when the active account differs from the personal account
    refetch: () => void;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

// Hook to consume the session context. Must be used inside a SessionProvider.
export function useSession() {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
}

export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const searchParams = useSearchParams();
    const workingProfileId = searchParams.get('workingProfile');
    const workingProfileRef = useRef<string | null>(workingProfileId);
    const [sessionState, setSessionState] = useState<SessionState>({
        loading: true,
        profile: null,
        permissions: null,
        accountId: null,
        personalAccountId: null,
        isManaging: false,
        refetch: () => {},
    });
    const fetchDataRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});

    fetchDataRef.current = async (forceRefresh = false) => {
        setSessionState(s => ({ ...s, loading: true }));

        const result = await checkSession(workingProfileId);

        if (!result.valid) {
            // Clear any stale cached data on invalid session
            deleteSessionData();
            setSessionState(s => ({ ...s, loading: false, profile: null, permissions: [] }));
            return;
        }

        // Compare cached profile against fresh data — only update sessionStorage if changed
        const cachedProfile = getSessionData(PROFILE_INFO_KEY);
        const profileChanged = !cachedProfile ||
            cachedProfile.firstName !== result.profileInfo.firstName ||
            cachedProfile.lastName !== result.profileInfo.lastName ||
            cachedProfile.neupId !== result.profileInfo.neupId ||
            cachedProfile.accountType !== result.profileInfo.accountType;

        if (profileChanged) {
            setSessionData(PROFILE_INFO_KEY, result.profileInfo);
        }

        // Compare cached permissions JSON — only update if the set has changed
        const cachedPermissions = getSessionData(JWT_KEY);
        const freshPermissionsJson = JSON.stringify(result.permissions);
        if (cachedPermissions !== freshPermissionsJson) {
            setSessionData(JWT_KEY, freshPermissionsJson);
        }

        // Only fetch the full profile from the server if the data has changed or is missing
        let fullProfile: UserProfile | null = sessionState.profile;
        if (forceRefresh || profileChanged || !fullProfile) {
            fullProfile = await fetchUserProfile(result.accountId);
        }

        setSessionState({
            loading: false,
            profile: fullProfile,
            permissions: result.permissions,
            accountId: result.accountId,
            personalAccountId: result.personalAccountId,
            isManaging: result.accountId !== result.personalAccountId,
            refetch: () => fetchDataRef.current(true),
        });
    };

    // Clears the sessionStorage cache and forces a full re-fetch from the server.
    const clearCacheAndRefetch = () => {
        deleteSessionData();
        void fetchDataRef.current(true);
    };

    useEffect(() => {
        void fetchDataRef.current();

        const handleAuthStateChanged = () => {
            clearCacheAndRefetch();
        };

        window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthStateChanged);

        return () => {
            window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthStateChanged);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (workingProfileRef.current === workingProfileId) {
            return;
        }

        workingProfileRef.current = workingProfileId;
        clearCacheAndRefetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workingProfileId]);

    return (
        <SessionContext.Provider value={{ ...sessionState, refetch: clearCacheAndRefetch }}>
            {children}
        </SessionContext.Provider>
    );
};
