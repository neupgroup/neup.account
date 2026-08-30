/*
::neup.documentation::application-role-details-page

Server-rendered role details page for application authz management.

The page supports a dedicated edit route that renders only the role-info
editor, instead of the full role detail layout.

::end
*/

import { notFound } from 'next/navigation';
import { FlowLink } from '@/components/flow-link';
import {
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountViewApplicationRoles,
  getApplicationAuthzConfig,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import {
  getAppDefaultRoleId,
  getAppRoleAccountCount,
  getAppPermissions,
  getAppRoles,
} from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleDetailEditor } from '@/app/(manage)/application/_components/role-detail-editor';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { toApplicationAuthzDefinitionOptions } from '@/services/applications/authz-config';

type Props = {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function RoleDetailsQueryPage({ params, searchParams }: Props) {
  const { roleId } = await params;
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function RoleDetailsPage({
  applicationId,
  roleId,
  mode,
  editingInfo,
}: {
  applicationId: string;
  roleId: string;
  mode?: string;
  editingInfo?: boolean;
}) {
  const isEditingInfo = editingInfo === true;
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, `roles/${roleId}`);

  const [canViewRoles, canManageRoles] = await Promise.all([
    canCurrentAccountViewApplicationRoles(applicationId, { rootMode: mode === 'root' }),
    canCurrentAccountManageApplicationRoles(applicationId, { rootMode: mode === 'root' }),
  ]);
  if (!canViewRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader title="Role Details" description={`Manage role permissions for ${details.name}.`} />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view application roles.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const [roles, permissions, defaultRoleId, authzConfig] = await Promise.all([
    getAppRoles(applicationId),
    getAppPermissions(applicationId),
    getAppDefaultRoleId(applicationId),
    getApplicationAuthzConfig(applicationId),
  ]);
  const role = roles.find((item) => item.id === roleId);
  if (!role) notFound();
  const roleAccountCount = await getAppRoleAccountCount(applicationId, role.id);
  const roleAccountLabel = `${roleAccountCount.toLocaleString()} Account`;
  const roleUsersHref = applicationHref('/application/users', applicationId, {
    ...(mode ? { mode } : undefined),
    role: role.id,
  });

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditingInfo ? `Edit Role Info: ${role.name}` : `Role: ${role.name}`}{' '}
            <FlowLink
              href={roleUsersHref}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {roleAccountLabel}
            </FlowLink>
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditingInfo ? 'Update this role metadata only.' : (role.description || 'No description')}
          </p>
        </div>
      </div>
      <RoleDetailEditor
        appId={applicationId}
        role={role}
        permissions={permissions}
        defaultRoleId={defaultRoleId}
        canManage={canManageRoles}
        applicableForOptions={toApplicationAuthzDefinitionOptions(authzConfig?.applicableForDefinitions ?? [])}
        mode={mode}
        editingInfo={isEditingInfo}
      />
    </div>
  );
}
