import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { checkPermissions } from '@/services/user';
import { getAppPermissions, getAppRoles } from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleDetailEditor } from '@/app/(manage)/application/_components/role-detail-editor';

type Props = { params: Promise<{ id: string; roleId: string }> };

export default async function RoleDetailsPage({ params }: Props) {
  const { id, roleId } = await params;
  const details = await getApplicationDetailsForViewerV2(id);
  if (!details) notFound();

  const canRootManage = await checkPermissions(['root.application.edit']);
  const canManageRoles = details.canDelete || canRootManage;
  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}/roles?mode=root`} />
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

  const [roles, permissions] = await Promise.all([getAppRoles(id), getAppPermissions(id)]);
  const role = roles.find((item) => item.id === roleId);
  if (!role) notFound();

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}/roles?mode=root`} />
        <PrimaryHeader
          title={`Role: ${role.name}`}
          description={role.description || 'No description'}
        />
      </div>
      <RoleDetailEditor appId={id} role={role} permissions={permissions} />
    </div>
  );
}
