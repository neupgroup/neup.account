import { forbidden, notFound } from 'next/navigation';
import { BackButton } from '@neup/components/element/backButton';
import { Card, CardContent, CardHeader, CardTitle } from '@neup/components/ui/card';
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
      <BackButton backsTo={applicationHref(`/application/users/${connId}`, applicationId, mode ? { mode } : undefined)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-7">Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          User activity timeline for this application connection will be added here.
        </CardContent>
      </Card>
    </div>
  );
}
