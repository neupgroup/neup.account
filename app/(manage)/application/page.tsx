import type { Metadata } from 'next';
import { getApplicationsManagePageData } from '@/services/applications/form-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from '@/components/icons';
import { Suspense } from 'react';
import { ApplicationsPillView } from '@/app/(manage)/application/_components/applications-pill-view';
import { ApplicationDetailPage } from '@/app/(manage)/application/_components/application-detail-page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { createPageMetadata } from '@/core/metadata';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (!applicationId) {
    return createPageMetadata('Application Management');
  }

  const details = await getApplicationDetailsForViewerV2(applicationId);
  return createPageMetadata(details?.name ? `${details.name}'s Management` : 'Application Management');
}

export default async function ApplicationsManagePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (applicationId) {
    return <ApplicationDetailPage applicationId={applicationId} mode={resolvedSearchParams.mode} />;
  }

  const { sections, canCreateApplication, hasPartialError } = await getApplicationsManagePageData();

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
        <Suspense fallback={null}>
          <ApplicationsPillView sections={sections} canCreateApplication={canCreateApplication} />
        </Suspense>
      )}
    </div>
  );
}
