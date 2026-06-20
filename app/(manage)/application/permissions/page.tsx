import { notFound } from 'next/navigation';
import {
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountViewApplicationRoles,
  getApplicationDetailsForViewerV2,
} from '@/services/applications/manage';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { PermissionPanel } from '@/app/(manage)/application/_components/permission-panel';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function ApplicationPermissionsQueryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (!applicationId) notFound();
  const mode = resolvedSearchParams.mode;
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();

  const [canViewPermissions, canManagePermissions] = await Promise.all([
    canCurrentAccountViewApplicationRoles(applicationId),
    canCurrentAccountManageApplicationRoles(applicationId),
  ]);

  if (!canViewPermissions) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader
            title="Permissions"
            description={`Manage permissions for ${details.name}.`}
          />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view application permissions.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const permissions = await getAppPermissions(applicationId);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Permissions"
          description={`Define and manage permissions for ${details.name}.`}
        />
      </div>

      <PermissionPanel appId={applicationId} initialPermissions={permissions} canManage={canManagePermissions} />
    </div>
  );
}
