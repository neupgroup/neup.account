import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAppDefaultRoleId, getAppRoles } from '@/services/applications/authz-manage';
import { getAuthzWebhookUrl } from '@/services/applications/authz-webhook';
import { checkPermissions } from '@/services/user';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationRolesPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  const canRootManage = await checkPermissions(['application.edit.scopeRoot'], undefined, { roleScope: 'individual.root' });
  const canManageRoles = details.canDelete || canRootManage;

  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}`} />
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
    getAppRoles(id),
    getAuthzWebhookUrl(id),
    getAppDefaultRoleId(id),
  ]);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}`} />
        <PrimaryHeader
          title="Roles & Permissions"
          description={`Manage roles for ${details.name}. Open a role to assign permissions.`}
        />
      </div>

      <RolesPanel
        appId={id}
        initialRoles={roles}
        hasWebhook={Boolean(webhookUrl)}
        defaultRoleId={defaultRoleId}
      />
    </div>
  );
}
