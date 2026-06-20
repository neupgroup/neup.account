import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FlowLink } from '@/components/ui/flow-link';
import { ArrowLeft } from '@/components/icons';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { UsersList } from './_components/users-list';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUsersQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();
  const details = await getApplicationDetailsForViewerV2(applicationId);
  if (!details) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref('/application', applicationId)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">{details.name}</p>
      </div>

      <UsersList appId={applicationId} />
    </div>
  );
}
