import { notFound } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLink } from '@/components/ui/flow-link';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { canCurrentAccountRemoveApplicationUser } from '@/services/applications/manage';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserDeleteQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();
  const canRemoveUser = await canCurrentAccountRemoveApplicationUser(applicationId);
  if (!canRemoveUser) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref(`/application/users/${connId}`, applicationId, { mode: 'root' })}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Account removal flow for this application user will be added here.
        </CardContent>
      </Card>
    </div>
  );
}
