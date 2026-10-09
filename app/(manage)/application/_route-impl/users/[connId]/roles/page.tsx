import { forbidden, notFound } from 'next/navigation';
import { BackButton } from '@neup/components/element/backButton';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import {
  canCurrentAccountUpdateApplicationUserRole,
  canCurrentAccountUseRootApplicationMode,
  canCurrentAccountViewApplicationUsers,
  getApplicationDetailsForViewerV2,
  getApplicationRoleOptions,
  getApplicationUserConnectionDetails,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import {
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';
import { RoleSelector } from '../_components/role-selector';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserRolesQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationUserRolesPage({
  applicationId,
  connId,
  mode,
}: {
  applicationId: string;
  connId: string;
  mode?: string;
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

  const [applicationDetails, details, canViewUsers, canUpdateUserRole] = await Promise.all([
    getApplicationDetailsForViewerV2(applicationId, {
      rootMode: mode === 'root',
      rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
    }),
    getApplicationUserConnectionDetails({ appId: applicationId, connectionId: connId, rootMode: mode === 'root' }),
    canCurrentAccountViewApplicationUsers(applicationId, { rootMode: mode === 'root' }),
    canCurrentAccountUpdateApplicationUserRole(applicationId, { rootMode: mode === 'root' }),
  ]);

  if (!applicationDetails || !details) notFound();
  if (!canViewUsers) forbidden();
  if (!canUpdateUserRole) forbidden();
  if (mode === 'root') await logRootApplicationActivity(applicationId, `users/${connId}/roles`);

  const roles = await getApplicationRoleOptions(applicationId, details.accountType, {
    rootMode: mode === 'root',
    includeRoleIds: [...details.roleIds, ...details.pendingRoleIds],
  });

  return (
    <div className="grid gap-6">
      <BackButton backsTo={applicationHref(`/application/users/${details.connectionId}`, applicationId, mode ? { mode } : undefined)} />

      <div className="grid gap-0.5">
        <h1 className="font-bold tracking-tight text-2xl leading-8">Role Management</h1>
        <p className="text-muted-foreground text-sm leading-6">{applicationDetails.name}</p>
      </div>

      <RoleSelector
        appId={applicationId}
        connectionId={details.connectionId}
        roles={roles}
        currentRoleIds={details.roleIds}
        pendingRoleIds={details.pendingRoleIds}
        rootMode={mode === 'root'}
      />
    </div>
  );
}
