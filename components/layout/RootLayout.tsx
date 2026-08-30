import { Suspense } from 'react';
import { Toaster } from '#/components/ui/toast';
import { AppProviders } from '@/components/layout/AppProviders';
import { PageProgressBar } from '@/components/page-progress-bar';
import { UrlErrorBanner } from '@/components/ui/url-error-banner';
import { PersistentBacksTo } from '@/components/persistent-backs-to';
import { HeaderV1 } from '@/components/layout/header.v1';
import { getSiteLogoUrl } from '@/services/manage/site/logo';
import { AppTitleSync } from '@/components/app-title-sync';
import { checkSession } from '@/services/account/check';

export default async function RootLayout({ children }: { children?: React.ReactNode }) {
  const [logoUrl, session] = await Promise.all([getSiteLogoUrl(), checkSession()]);
  const initialSession = session.valid ? { profileInfo: session.profileInfo, permissions: session.permissions, accountId: session.accountId, personalAccountId: session.personalAccountId } : null;

  return <AppProviders initialSession={initialSession}><AppTitleSync /><PersistentBacksTo /><PageProgressBar /><div className="flex min-h-screen flex-col"><HeaderV1 logoUrl={logoUrl} /><main className="flex-1 pt-16">{children}</main></div><Toaster /><Suspense><UrlErrorBanner /></Suspense></AppProviders>;
}
