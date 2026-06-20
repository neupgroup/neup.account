import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { AppEditForm } from '@/app/(manage)/application/_components/app-edit-form';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationEditPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  if (!details.canDelete) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application', id)} />
          <PrimaryHeader title="Basic Information" description="Application details." />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can edit this application.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', id)} />
        <PrimaryHeader
          title="Basic Information"
          description={`Update the details for ${details.name}.`}
        />
      </div>

      <AppEditForm
        appId={id}
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
