import { forbidden, notFound } from 'next/navigation';
import { BackButton } from '@neup/components/element/backButton';
import { Card, CardContent, CardHeader, CardTitle } from '@neup/components/ui/card';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { canCurrentAccountRemoveApplicationUser, logRootApplicationActivity } from '@/services/applications/manage';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserDeleteQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationUserDeletePage({ applicationId, connId, mode }: { applicationId: string; connId: string; mode?: string }) {
  const canRemoveUser = await canCurrentAccountRemoveApplicationUser(applicationId, { rootMode: mode === 'root' });
  if (!canRemoveUser) forbidden();
  if (mode === 'root') await logRootApplicationActivity(applicationId, `users/${connId}/delete`);

  return (
    <div className="grid gap-6">
      <BackButton backsTo={applicationHref(`/application/users/${connId}`, applicationId, mode ? { mode } : undefined)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-7">Delete Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Account removal flow for this application user will be added here.
        </CardContent>
      </Card>
    </div>
  );
}
