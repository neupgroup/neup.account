import { notFound } from 'next/navigation';
import {
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountViewApplicationRoles,
  getApplicationDetailsForViewerV2,
} from '@/services/applications/manage';
import { getAppDefaultRoleId, getAppPermissions, getAppRoles } from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleDetailEditor } from '@/app/(manage)/application/_components/role-detail-editor';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function RoleDetailsQueryPage({ params, searchParams }: Props) {
  const { roleId } = await params;
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();

  const [canViewRoles, canManageRoles] = await Promise.all([
    canCurrentAccountViewApplicationRoles(applicationId),
    canCurrentAccountManageApplicationRoles(applicationId),
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

  const [roles, permissions, defaultRoleId] = await Promise.all([
    getAppRoles(applicationId),
    getAppPermissions(applicationId),
    getAppDefaultRoleId(applicationId),
  ]);
  const role = roles.find((item) => item.id === roleId);
  if (!role) notFound();

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title={`Role: ${role.name}`}
          description={role.description || 'No description'}
        />
      </div>
      <RoleDetailEditor appId={applicationId} role={role} permissions={permissions} defaultRoleId={defaultRoleId} canManage={canManageRoles} />
    </div>
  );
}
