import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FlowLink } from '@/components/ui/flow-link';
import { ArrowLeft } from '@/components/icons';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { UsersList } from './_components/users-list';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationUsersPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  return (
    <div className="grid gap-6">
      {/* Back */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref('/application', id)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">{details.name}</p>
      </div>

      <UsersList appId={id} />
    </div>
  );
}
