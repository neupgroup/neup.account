import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { checkPermissions } from '@/services/user';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { PermissionPanel } from '@/app/(manage)/application/_components/permission-panel';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function ApplicationPermissionsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode } = await searchParams;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  const canRootManage = await checkPermissions(['application.edit.scopeRoot'], undefined, { roleScope: 'individual.root' });
  const canManagePermissions = details.canDelete || canRootManage;
  const modeSuffix = mode ? `?mode=${encodeURIComponent(mode)}` : '';

  if (!canManagePermissions) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}${modeSuffix}`} />
          <PrimaryHeader
            title="Permissions"
            description={`Manage permissions for ${details.name}.`}
          />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can manage permissions.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const permissions = await getAppPermissions(id);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}${modeSuffix}`} />
        <PrimaryHeader
          title="Permissions"
          description={`Define and manage permissions for ${details.name}.`}
        />
      </div>

      <PermissionPanel appId={id} initialPermissions={permissions} />
    </div>
  );
}
