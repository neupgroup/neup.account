import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountViewApplicationRoles,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { BackButton } from '#/components/ui/back-button';
import { PrimaryHeader } from '#/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { PermissionPanel } from '@/app/(manage)/application/_components/permission-panel';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { formMetadata } from '#/core/metadata';
import { PermissionDetailEditor } from '@/app/(manage)/application/_components/permission-detail-editor';

/*
::neup.documentation::manage-application-permissions-page
::title Application Permissions Page

Renders the application permission list and detail editor.

::public

This page loads the target application, checks permission-management access, and renders either the permission list or a selected permission detail editor.

::public end

::end
*/

type Props = {
  searchParams: Promise<{ application?: string | string[]; permission?: string | string[]; mode?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);
  const permissionId = getQueryParam(resolvedSearchParams.permission);

  if (!applicationId) {
    return formMetadata({ title: 'Permissions, Application Management' });
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: resolvedSearchParams.mode === 'root' });
  if (!permissionId) {
    return formMetadata({
      title: details?.name ? `Permissions, ${details.name} Management` : 'Permissions, Application Management',
    });
  }

  const permissions = await getAppPermissions(applicationId);
  const permission = permissions.find((item) => item.id === permissionId);
  return formMetadata({
    title: [
      permission?.name ?? 'Permission',
      'Permissions',
      details?.name ? `${details.name} Management` : 'Application Management',
    ].join(', '),
  });
}

export default async function ApplicationPermissionsQueryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);
  const permissionId = getQueryParam(resolvedSearchParams.permission);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationPermissionsPage({
  applicationId,
  permissionId,
  mode,
}: {
  applicationId: string;
  permissionId?: string;
  mode?: string;
}) {
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'permissions');

  const [canViewPermissions, canManagePermissions] = await Promise.all([
    canCurrentAccountViewApplicationRoles(applicationId, { rootMode: mode === 'root' }),
    canCurrentAccountManageApplicationRoles(applicationId, { rootMode: mode === 'root' }),
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

  if (permissionId) {
    const permission = permissions.find((item) => item.id === permissionId);
    if (!permission) notFound();

    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application/permissions', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader
            title={permission.name}
            description={permission.description || `Manage permission metadata for ${details.name}.`}
          />
        </div>

        <PermissionDetailEditor
          appId={applicationId}
          permission={permission}
          canManage={canManagePermissions}
          mode={mode}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Permissions"
          description={`Define and manage permissions for ${details.name}.`}
        />
      </div>

      <PermissionPanel
        appId={applicationId}
        initialPermissions={permissions}
        canManage={canManagePermissions}
        mode={mode}
      />
    </div>
  );
}
