import { notFound } from 'next/navigation';
import { canCurrentAccountManageApplicationRoles, getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleCreateForm } from '@/app/(manage)/application/_components/role-create-form';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function AddRoleQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();

  const canManageRoles = await canCurrentAccountManageApplicationRoles(applicationId);
  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
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

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader title="Add Role" description={`Create a role for ${details.name}. Permissions are mapped after the role is created.`} />
      </div>
      <RoleCreateForm appId={applicationId} />
    </div>
  );
}
