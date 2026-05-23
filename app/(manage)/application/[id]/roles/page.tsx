import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAppCapabilities, getAppRoles } from '@/services/applications/authz-manage';
import { getAuthzWebhookUrl } from '@/services/applications/authz-webhook';
import { checkPermissions } from '@/services/user';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { CapabilityPanel } from '@/app/(manage)/application/_components/capability-panel';
import { RolesPanel } from '@/app/(manage)/application/_components/roles-panel';

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationRolesPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  const canRootManage = await checkPermissions(['root.application.edit']);
  const canManageRoles = details.canDelete || canRootManage;

  if (!canManageRoles) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}`} />
          <PrimaryHeader
            title="Roles & Capabilities"
            description={`Manage capabilities and roles for ${details.name}.`}
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

  const [capabilities, roles, webhookUrl] = await Promise.all([
    getAppCapabilities(id),
    getAppRoles(id),
    getAuthzWebhookUrl(id),
  ]);

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}`} />
        <PrimaryHeader
          title="Roles & Capabilities"
          description={`Define capabilities and group them into roles for ${details.name}.`}
        />
      </div>

      <div className="grid gap-2">
        <h2 className="text-base font-semibold">Capabilities</h2>
        <p className="text-sm text-muted-foreground">
          Define the individual permissions this application can assign.
        </p>
      </div>
      <CapabilityPanel appId={id} initialCapabilities={capabilities} />

      <div className="grid gap-2">
        <h2 className="text-base font-semibold">Roles</h2>
        <p className="text-sm text-muted-foreground">
          Group capabilities into roles. Roles are assigned to accounts via access grants.
        </p>
      </div>
      <RolesPanel
        appId={id}
        initialRoles={roles}
        capabilities={capabilities}
        hasWebhook={Boolean(webhookUrl)}
      />
    </div>
  );
}
