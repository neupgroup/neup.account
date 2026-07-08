import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getApplicationsManagePageData } from '@/services/applications/form-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from '@/components/icons';
import { Suspense } from 'react';
import { ApplicationsPillView } from '@/app/(manage)/application/_components/applications-pill-view';
import { ApplicationDetailPage } from '@/app/(manage)/application/_components/application-detail-page';
import {
  getApplicationMode,
  getApplicationOverviewTab,
  getQueryParam,
} from '@/app/(manage)/application/_lib/query-param';
import { canCurrentAccountUseRootApplicationMode, getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { createPageMetadata } from '@/core/metadata';

/*
::neup.documentation::application-manage-page

Server entry for the `/application` route.

The page treats `mode=root` as a server-side access mode only. Overview tab
selection uses the separate `tab` query parameter so direct URL loads do not
depend on client-only search-param state. The application list suspense
fallback renders a stable skeleton instead of `null` so deep links never show
a blank content area while client query-param helpers hydrate.

::end
*/

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string; tab?: string }>;
};

function ApplicationsPillViewSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading applications">
      <div className="flex flex-wrap items-center gap-2">
        {['Using', 'Development', 'Root'].map((label, index) => (
          <div
            key={label}
            className={[
              'h-8 rounded-full border px-4',
              index === 0 ? 'w-20 bg-muted' : 'w-28 bg-muted/50',
            ].join(' ')}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-12 w-12 shrink-0 rounded-xl border bg-muted/60" />
              <div className="min-w-0 space-y-2">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="h-3 w-28 rounded bg-muted/70" />
              </div>
            </div>
            <div className="h-5 w-5 shrink-0 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);
  const rootMode = getApplicationMode(resolvedSearchParams.mode) === 'root';

  if (rootMode) {
    const canUseRootMode = await canCurrentAccountUseRootApplicationMode();
    if (!canUseRootMode) {
      return createPageMetadata('Application Management');
    }
  }

  if (!applicationId) {
    return createPageMetadata('Application Management');
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, {
    rootMode,
  });
  return createPageMetadata(details?.name ? `${details.name}'s Management` : 'Application Management');
}

export default async function ApplicationsManagePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);
  const mode = getApplicationMode(resolvedSearchParams.mode);
  const rootMode = mode === 'root';
  const initialTab = getApplicationOverviewTab(resolvedSearchParams.tab, resolvedSearchParams.mode);

  if (rootMode) {
    const canUseRootMode = await canCurrentAccountUseRootApplicationMode();
    if (!canUseRootMode) notFound();
  }

  if (applicationId) {
    return <ApplicationDetailPage applicationId={applicationId} mode={mode} />;
  }

  const pageData = await getApplicationsManagePageData({ rootMode });
  if (!pageData) notFound();

  const { sections, canCreateApplication, hasPartialError } = pageData;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground">
          Manage and administer applications.
        </p>
      </div>

      {hasPartialError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Partial load</AlertTitle>
          <AlertDescription>
            Some application data could not be loaded. The sections below may be incomplete.
          </AlertDescription>
        </Alert>
      )}

      {sections.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            No applications available. You need developer or administrator access to see applications here.
          </div>
        </div>
      ) : (
        <Suspense fallback={<ApplicationsPillViewSkeleton />}>
          <ApplicationsPillView
            sections={sections}
            canCreateApplication={canCreateApplication}
            initialTab={initialTab}
          />
        </Suspense>
      )}
    </div>
  );
}
