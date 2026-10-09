import { SharedPermissionNotice } from '@/app/(manage)/application/_components/shared-permission-notice';
import { notFound } from 'next/navigation';
import {
  canCurrentAccountManageApplicationRoles,
  getApplicationAuthzConfig,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import { BackButton } from '@neup/components/element/backButton';
import { TitleSet } from '@neup/components/element/titleset';
import { Alert, AlertDescription, AlertTitle } from '@neup/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RoleCreateForm } from '@/app/(manage)/application/_components/role-create-form';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { toApplicationAuthzDefinitionOptions } from '@/services/applications/authz-config';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function AddRoleQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function AddRolePage({ applicationId, mode }: { applicationId: string; mode?: string }) {
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'roles/add');

  const canManageRoles = await canCurrentAccountManageApplicationRoles(applicationId, { rootMode: mode === 'root' });
  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
          <TitleSet level={1} title="Add Role" subtitle={`Create a role for ${details.name}.`} titleClassName="text-2xl leading-8" subtitleClassName="text-sm leading-6" />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can manage roles.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (details.usePermissionFrom) {
    return <SharedPermissionNotice appId={applicationId} sourceId={details.usePermissionFrom} mode={mode} />;
  }

  const authzConfig = await getApplicationAuthzConfig(applicationId);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application/roles', applicationId, mode ? { mode } : undefined)} />
        <TitleSet level={1} title="Add Role" subtitle={`Create a role for ${details.name}. Permissions are mapped after the role is created.`} titleClassName="text-2xl leading-8" subtitleClassName="text-sm leading-6" />
      </div>
      <RoleCreateForm
        appId={applicationId}
        applicableForOptions={toApplicationAuthzDefinitionOptions(authzConfig?.applicableForDefinitions ?? [])}
      />
    </div>
  );
}
