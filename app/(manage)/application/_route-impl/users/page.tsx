import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { Button } from '#/components/ui/button';
import { FlowLink } from '@/components/flow-link';
import { ArrowLeft } from '@/components/icons';
import {
  canCurrentAccountUseRootApplicationMode,
  canCurrentAccountViewApplicationUsers,
  getApplicationDetailsForViewerV2,
  getApplicationUserStats,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import {
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { UsersList } from './_components/users-list';
import { formMetadata } from '#/core/metadata';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string; role?: string | string[] }>;
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

export async function ApplicationUsersPage({
  applicationId,
  mode,
  role,
}: {
  applicationId: string;
  mode?: string;
  role?: string;
}) {
  if (
    mode === 'root' &&
    !(await canCurrentAccountUseRootApplicationMode([
      ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
      ROOT_APPLICATION_USER_VIEW_PERMISSION,
    ]))
  ) {
    forbidden();
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, {
    rootMode: mode === 'root',
    rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
  });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'users');
  const canViewUsers = await canCurrentAccountViewApplicationUsers(applicationId, { rootMode: mode === 'root' });
  if (!canViewUsers) forbidden();
  const userStats = await getApplicationUserStats(applicationId, { rootMode: mode === 'root' });
  const userCount = userStats?.total ?? 0;

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="plain" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref('/application', applicationId, mode ? { mode } : undefined)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Users{' '}
          <span className="text-muted-foreground">
            of{' '}
            <FlowLink
              href={applicationHref('/application', applicationId, mode ? { mode } : undefined)}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {details.name}
            </FlowLink>
          </span>
        </h1>
        <p className="text-muted-foreground">
          {role
            ? 'Showing users assigned to the selected role.'
            : `${userCount.toLocaleString()} user${userCount === 1 ? '' : 's'} found for the application.`}
        </p>
      </div>

      <UsersList appId={applicationId} roleId={role} />
    </div>
  );
}
