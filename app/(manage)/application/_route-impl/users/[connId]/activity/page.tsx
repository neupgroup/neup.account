import { forbidden, notFound } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { Button } from '#/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card';
import { FlowLink } from '#/components/ui/flow-link';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { canCurrentAccountViewApplicationUsers, logRootApplicationActivity } from '@/services/applications/manage';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserActivityQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationUserActivityPage({ applicationId, connId, mode }: { applicationId: string; connId: string; mode?: string }) {
  const canViewUsers = await canCurrentAccountViewApplicationUsers(applicationId, { rootMode: mode === 'root' });
  if (!canViewUsers) forbidden();
  if (mode === 'root') await logRootApplicationActivity(applicationId, `users/${connId}/activity`);

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
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          User activity timeline for this application connection will be added here.
        </CardContent>
      </Card>
    </div>
  );
}
