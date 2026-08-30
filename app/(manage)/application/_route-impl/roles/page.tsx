import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  canCurrentAccountManageApplicationRoles,
  canCurrentAccountResetApplicationRolePush,
  canCurrentAccountViewApplicationRoles,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import { getAppDefaultRoleId, getAppRoles } from '@/services/applications/authz-manage';
import { getAuthzWebhookUrl } from '@/services/applications/authz-webhook';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { formMetadata } from '#/core/metadata';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

/**
 * ::neup.documentation::manage-application-roles-page
 * ::title Application Roles Page
 *
 * Server page for viewing and managing one application's roles and permissions.
 *
 * ::public
 *
 * This page resolves the target application, checks role-view access, and renders the roles panel with current role data.
 *
 * ::public end
 *
 * ::private
 *
 * Role-management, push-reset permissions, and default-role data are all loaded server-side so the panel can render in one pass.
 *
 * ::private end
 *
 * ::end
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) {
    return formMetadata({ title: 'Roles & Permissions, Application Management' });
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  return formMetadata({
    title: details?.name
      ? `Roles & Permissions, ${details.name} Management`
      : 'Roles & Permissions, Application Management',
  });
}

export default async function ApplicationRolesQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationRolesPage({ applicationId, mode }: { applicationId: string; mode?: string }) {
  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'roles');

  const [canViewRoles, canManageRoles, canResetPush] = await Promise.all([
    canCurrentAccountViewApplicationRoles(applicationId, { rootMode: mode === 'root' }),
    canCurrentAccountManageApplicationRoles(applicationId, { rootMode: mode === 'root' }),
    canCurrentAccountResetApplicationRolePush(applicationId, { rootMode: mode === 'root' }),
  ]);
  if (!canViewRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader
            title="Roles & Permissions"
            description={`Manage permissions and roles for ${details.name}.`}
          />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view application roles.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const [roles, webhookUrl, defaultRoleId] = await Promise.all([
    getAppRoles(applicationId),
    getAuthzWebhookUrl(applicationId),
    getAppDefaultRoleId(applicationId),
  ]);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Roles & Permissions"
          description={`Manage roles for ${details.name}. Open a role to assign permissions.`}
        />
      </div>

      <RolesPanel
        appId={applicationId}
        canManage={canManageRoles}
        canResetPush={canResetPush}
        initialRoles={roles}
        hasWebhook={Boolean(webhookUrl)}
        defaultRoleId={defaultRoleId}
      />
    </div>
  );
}
