import type {Metadata} from 'next';
import './globals.css';
import 'nprogress/nprogress.css';
import { Toaster } from "@/components/ui/toaster"
import { GeolocationProvider } from '@/core/providers/geolocation';
import { SessionProvider } from '@/core/providers/session';
import { PageProgressBar } from '@/components/page-progress-bar';
import { Suspense } from 'react';
import { UrlErrorBanner } from '@/components/ui/url-error-banner';
import { PersistentBacksTo } from '@/components/persistent-backs-to';
import { HeaderV1 } from '@/components/layout/header.v1';
import { getSiteLogoUrl } from '@/services/manage/site/logo';

export const metadata: Metadata = {
  title: 'Neup.Account',
  description: 'Create an account to access NeupID Group Products and Services.',
  metadataBase: new URL('https://neupgroup.com/account'),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const logoUrl = await getSiteLogoUrl();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <GeolocationProvider>
          <SessionProvider>
            <PersistentBacksTo />
            <PageProgressBar />
            <div className="flex min-h-screen flex-col">
              <HeaderV1 logoUrl={logoUrl} />
              <main className="flex-1">{children}</main>
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
