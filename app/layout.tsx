import type {Metadata} from 'next';
import './globals.css';
import 'nprogress/nprogress.css';
import { Toaster } from "@/components/ui/toaster"
import { GeolocationProvider } from '@/core/providers/geolocation';
import { SessionProvider } from '@/inapp/auth/session-context';
import { PageProgressBar } from '@/components/page-progress-bar';
import { Suspense } from 'react';
import { UrlErrorBanner } from '@/components/ui/url-error-banner';
import { PersistentBacksTo } from '@/components/persistent-backs-to';
import { HeaderV1 } from '@/components/layout/header.v1';
import { getSiteLogoUrl } from '@/services/manage/site/logo';
import { APP_NAME, DEFAULT_META_DESCRIPTION } from '@/core/metadata';
import { AppTitleSync } from '@/components/app-title-sync';
import { checkSession } from '@/services/account/check';

export const metadata: Metadata = {
  title: APP_NAME,
  description: DEFAULT_META_DESCRIPTION,
  metadataBase: new URL('https://neupgroup.com/account'),
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [logoUrl, session] = await Promise.all([
    getSiteLogoUrl(),
    checkSession(),
  ]);
  const initialSession = session.valid
    ? {
        profileInfo: session.profileInfo,
        permissions: session.permissions,
        accountId: session.accountId,
        personalAccountId: session.personalAccountId,
      }
    : null;

  return (
    <html lang="en" className="[scrollbar-gutter:stable]">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <GeolocationProvider>
          <SessionProvider initialSession={initialSession}>
            <AppTitleSync />
            <PersistentBacksTo />
            <PageProgressBar />
            <div className="flex min-h-screen flex-col">
              <HeaderV1 logoUrl={logoUrl} />
              <main className="flex-1 pt-16">{children}</main>
            </div>
            <Toaster />
            <Suspense>
              <UrlErrorBanner />
            </Suspense>
          </SessionProvider>
        </GeolocationProvider>
      </body>
    </html>
  );
}
