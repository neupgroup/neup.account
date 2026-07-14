import React from 'react';
import { StartPageComponent } from './start-page-component';
import { GuestAccountInitializer } from './guest-initializer';
import { getAuthStartPageData } from '@/services/account/startPage';

type StartPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StartPage({ searchParams }: StartPageProps) {
  const resolvedSearchParams = await searchParams;
  const pageData = await getAuthStartPageData(resolvedSearchParams);
  
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      {/* Creates a guest account in auth_acc if none exists.
          Must be a client component + Server Action — cookies cannot be
          set from Server Components or layouts. */}
      <GuestAccountInitializer />
      <StartPageComponent
        accounts={pageData.accounts}
        hasActiveSession={pageData.hasActiveSession}
        appName={pageData.appName}
      />
    </React.Suspense>
  )
}
