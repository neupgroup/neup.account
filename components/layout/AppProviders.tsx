'use client';

import type { ReactNode } from 'react';
import { GeolocationProvider } from '#/core/providers/geolocation';
import { SessionProvider, type InitialAppSession } from '@/inapp/auth/session-context';

export function AppProviders({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: InitialAppSession;
}) {
  return (
    <GeolocationProvider>
      <SessionProvider initialSession={initialSession}>{children}</SessionProvider>
    </GeolocationProvider>
  );
}
