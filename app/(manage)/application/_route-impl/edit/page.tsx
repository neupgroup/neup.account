import { notFound } from 'next/navigation';
import { canCurrentAccountEditApplicationBasics, getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { AppEditForm } from '@/app/(manage)/application/_components/app-edit-form';
import prisma from '@/core/database/prisma';
import { getActiveAccountId } from '@/services/account/verify';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function ApplicationEditQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationEditPage({ applicationId, mode }: { applicationId: string; mode?: string }) {
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();

  const canEditBasics = await canCurrentAccountEditApplicationBasics(applicationId);
  if (!canEditBasics) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader title="Basic Information" description="Application details." />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to edit this application.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Basic Information"
          description={`Update the details for ${details.name}.`}
        />
      </div>

      <AppEditForm
        appId={applicationId}
        initialName={details.name}
        initialDescription={details.description}
        initialIcon={details.icon}
        initialWebsite={details.website}
        initialStatus={details.status ?? 'development'}
        hasPendingRequest={await (async () => {
          const accountId = await getActiveAccountId();
          if (!accountId) return false;
          const existing = await prisma.request.findFirst({
            where: { action: 'applicationChange', status: 'pending', senderId: accountId },
            select: { id: true },
          });
          return !!existing;
        })()}
      />
    </div>
  );
}
