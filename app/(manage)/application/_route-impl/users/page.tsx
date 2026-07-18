import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FlowLink } from '@/components/ui/flow-link';
import { ArrowLeft } from '@/components/icons';
import {
  canCurrentAccountViewApplicationUsers,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import {
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { UsersList } from './_components/users-list';
import { formMetadata } from '@/core/metadata';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) {
    return formMetadata({ title: 'Users, Application Management' });
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, {
    rootMode: mode === 'root',
    rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
  });
  return formMetadata({
    title: details?.name ? `Users, ${details.name} Management` : 'Users, Application Management',
  });
}

export default async function ApplicationUsersQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationUsersPage({ applicationId, mode }: { applicationId: string; mode?: string }) {
  const details = await getApplicationDetailsForViewerV2(applicationId, {
    rootMode: mode === 'root',
    rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
  });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'users');
  const canViewUsers = await canCurrentAccountViewApplicationUsers(applicationId, { rootMode: mode === 'root' });
  if (!canViewUsers) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref('/application', applicationId, mode ? { mode } : undefined)}>
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
