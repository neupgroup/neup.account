"use client";

/*
::neup.documentation::inapp-auth-session-context
::title In-App Auth Session Context Adapter

Account-app session adapter around the generic core session provider.

::public

Use this module from account-app client components that need profile, permission, active-account, and personal-account session state.

::public end

::private

The generic provider remains in `core`; this module performs account-app-specific hydration from `/bridge/api.v1/auth/me` and exposes the legacy account-app hook shape.

::private end

::end
*/

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  SessionProvider as CoreSessionProvider,
  useSession as useCoreSession,
  type SessionUser,
} from '@/core/providers/session';
import { APP_BASE_PATH } from '@/core/appconfig';
import type { StoredProfileInfo } from '@/inapp/auth/storage';

type AppSessionResponse = {
  success?: boolean;
  profileInfo?: StoredProfileInfo;
  permissions?: string[];
  accountId?: string;
  personalAccountId?: string;
};

export type InitialAppSession = {
  profileInfo: StoredProfileInfo;
  permissions: string[];
  accountId: string;
  personalAccountId: string;
} | null;

type AppSessionState = {
  loading: boolean;
  user: SessionUser | null;
  profile: StoredProfileInfo | null;
  permissions: string[] | null;
  accountId: string | null;
  personalAccountId: string | null;
  isManaging: boolean;
  setUser: (user: SessionUser | null) => void;
  updateUser: (updates: Partial<SessionUser>) => void;
  refetch: () => Promise<void>;
};

const AppSessionContext = createContext<AppSessionState | undefined>(undefined);
const SESSION_ENDPOINT = `${APP_BASE_PATH}/bridge/api.v1/auth/me`;

function profileToSessionUser(profile: StoredProfileInfo, accountId: string): SessionUser {
  return {
    accountId,
    neupId: profile.neupIdPrimary ?? profile.neupId ?? null,
    displayName: profile.nameDisplay ?? profile.displayName ?? null,
    displayImage: profile.accountPhoto ?? null,
    accountType: profile.accountType ?? null,
    verified: profile.verified ?? null,
  };
}

function isValidAppSessionResponse(data: unknown): data is AppSessionResponse {
  return Boolean(data && typeof data === 'object' && (data as AppSessionResponse).success === true);
}

function AppSessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: InitialAppSession;
}) {
  const coreSession = useCoreSession();
  const setCoreUserRef = useRef(coreSession.setUser);
  const [profile, setProfile] = useState<StoredProfileInfo | null>(initialSession?.profileInfo ?? null);
  const [permissions, setPermissions] = useState<string[] | null>(initialSession?.permissions ?? null);
  const [accountId, setAccountId] = useState<string | null>(initialSession?.accountId ?? coreSession.user?.accountId ?? null);
  const [personalAccountId, setPersonalAccountId] = useState<string | null>(initialSession?.personalAccountId ?? null);
  const [loadingAppSession, setLoadingAppSession] = useState(!initialSession);

  useEffect(() => {
    setCoreUserRef.current = coreSession.setUser;
  }, [coreSession.setUser]);

  const refetch = useCallback(async () => {
    setLoadingAppSession(true);

    try {
      const response = await fetch(SESSION_ENDPOINT, {
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        setProfile(null);
        setPermissions(null);
        setAccountId(null);
        setPersonalAccountId(null);
        setCoreUserRef.current(null);
        return;
      }

      const data = await response.json().catch(() => null);
      if (!isValidAppSessionResponse(data) || !data.profileInfo || !data.accountId) {
        setProfile(null);
        setPermissions(null);
        setAccountId(null);
        setPersonalAccountId(null);
        setCoreUserRef.current(null);
        return;
      }

      setProfile(data.profileInfo);
      setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
      setAccountId(data.accountId);
      setPersonalAccountId(data.personalAccountId ?? data.accountId);
      setCoreUserRef.current(profileToSessionUser(data.profileInfo, data.accountId));
    } finally {
      setLoadingAppSession(false);
    }
  }, []);

  useEffect(() => {
    if (!initialSession) {
      void refetch();
    }
  }, [initialSession, refetch]);

  const value = useMemo(
    () => ({
      loading: coreSession.loading || loadingAppSession,
      user: coreSession.user,
      profile,
      permissions,
      accountId,
      personalAccountId,
      isManaging: Boolean(accountId && personalAccountId && accountId !== personalAccountId),
      setUser: coreSession.setUser,
      updateUser: coreSession.updateUser,
      refetch,
    }),
    [
      accountId,
      coreSession.loading,
      coreSession.setUser,
      coreSession.updateUser,
      coreSession.user,
      loadingAppSession,
      permissions,
      personalAccountId,
      profile,
      refetch,
    ],
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function SessionProvider({
  children,
  initialUser = null,
  initialSession = null,
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
  initialSession?: InitialAppSession;
}) {
  const resolvedInitialUser = initialUser ?? (
    initialSession
      ? profileToSessionUser(initialSession.profileInfo, initialSession.accountId)
      : null
  );

  return (
    <CoreSessionProvider initialUser={resolvedInitialUser}>
      <AppSessionProvider initialSession={initialSession}>{children}</AppSessionProvider>
    </CoreSessionProvider>
  );
}

export function useSession(): AppSessionState {
  const context = useContext(AppSessionContext);

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  return context;
}
