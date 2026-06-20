import { notFound } from 'next/navigation';
import { canCurrentAccountManageApplicationRoles, getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAppDefaultRoleId, getAppRoles } from '@/services/applications/authz-manage';
import { getAuthzWebhookUrl } from '@/services/applications/authz-webhook';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationRolesQueryPage({ searchParams }: Props) {
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
          <BackButton href={applicationHref('/application', applicationId)} />
          <PrimaryHeader
            title="Roles & Permissions"
            description={`Manage permissions and roles for ${details.name}.`}
          />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can manage roles.</AlertDescription>
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
        <BackButton href={applicationHref('/application', applicationId)} />
        <PrimaryHeader
          title="Roles & Permissions"
          description={`Manage roles for ${details.name}. Open a role to assign permissions.`}
        />
      </div>

      <RolesPanel
        appId={applicationId}
        initialRoles={roles}
        hasWebhook={Boolean(webhookUrl)}
        defaultRoleId={defaultRoleId}
      />
    </div>
  );
}
