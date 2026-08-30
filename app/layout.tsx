import type { Metadata } from 'next';
import './globals.css';
import 'nprogress/nprogress.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { checkSession } from '@/services/account/check';
import RootLayout from '#/components/layout/RootLayout';
import { APP_NAME, DEFAULT_META_DESCRIPTION } from '#/core/metadata';

export const metadata: Metadata = {
  title: APP_NAME,
  description: DEFAULT_META_DESCRIPTION,
  metadataBase: new URL('https://neupgroup.com/account'),
};

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await checkSession();
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
        <AppProviders initialSession={initialSession}>
          <RootLayout>{children}</RootLayout>
        </AppProviders>
      </body>
    </html>
  );
}
