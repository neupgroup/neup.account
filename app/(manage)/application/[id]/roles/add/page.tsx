import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { checkPermissions } from '@/services/user';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleCreateForm } from '@/app/(manage)/application/_components/role-create-form';

type Props = { params: Promise<{ id: string }> };

export default async function AddRolePage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);
  if (!details) notFound();

  const canRootManage = await checkPermissions(['application.edit.scopeRoot'], undefined, { roleScope: 'individual.root' });
  const canManageRoles = details.canDelete || canRootManage;
  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}/roles?mode=root`} />
          <PrimaryHeader title="Add Role" description={`Create a role for ${details.name}.`} />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can manage roles.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const permissions = await getAppPermissions(id);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}/roles?mode=root`} />
        <PrimaryHeader title="Add Role" description={`Create a role for ${details.name} and assign permissions.`} />
      </div>
      <RoleCreateForm appId={id} permissions={permissions} />
    </div>
  );
}
