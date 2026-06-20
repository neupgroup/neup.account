import { notFound } from 'next/navigation';
import { canCurrentAccountManageApplicationRoles, getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAppDefaultRoleId, getAppPermissions, getAppRoles } from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleDetailEditor } from '@/app/(manage)/application/_components/role-detail-editor';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function RoleDetailsQueryPage({ params, searchParams }: Props) {
  const { roleId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();
  const details = await getApplicationDetailsForViewerV2(applicationId);
  if (!details) notFound();

  const canManageRoles = await canCurrentAccountManageApplicationRoles(applicationId);
  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application/roles', applicationId, { mode: 'root' })} />
          <PrimaryHeader title="Role Details" description={`Manage role permissions for ${details.name}.`} />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can manage roles.</AlertDescription>
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
        <BackButton href={applicationHref('/application/roles', applicationId, { mode: 'root' })} />
        <PrimaryHeader
          title={`Role: ${role.name}`}
          description={role.description || 'No description'}
        />
      </div>
      <RoleDetailEditor appId={applicationId} role={role} permissions={permissions} defaultRoleId={defaultRoleId} />
    </div>
  );
}
