import { notFound } from 'next/navigation';
import {
  canCurrentAccountUseRootApplicationMode,
  canCurrentAccountUpdateApplicationConfig,
  canCurrentAccountViewApplicationConfig,
  getApplicationDetailsForViewerV2,
  getAppConfigData,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { AppConfigForm } from '@/app/(manage)/application/_components/app-config-form';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function ApplicationConfigQueryPage({ searchParams }: Props) {
  const { application, mode } = await searchParams;
  const applicationId = getQueryParam(application);

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationConfigPage({ applicationId, mode }: { applicationId: string; mode?: string }) {
  const rootMode = mode === 'root';

  if (rootMode) {
    const canUseRootMode = await canCurrentAccountUseRootApplicationMode();
    if (!canUseRootMode) notFound();
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode });
  if (!details) notFound();
  if (rootMode) await logRootApplicationActivity(applicationId, 'config');

  const [canViewConfig, canUpdateConfig] = await Promise.all([
    canCurrentAccountViewApplicationConfig(applicationId, { rootMode }),
    canCurrentAccountUpdateApplicationConfig(applicationId, { rootMode }),
  ]);

  if (!canViewConfig) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
          <PrimaryHeader title="Configuration" description="API and access configuration." />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view this application configuration.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const config = await getAppConfigData(applicationId, { rootMode });
  if (!config) notFound();

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Configuration"
          description={`API secret, response fields, token fields, SSO origins, and server IPs for ${details.name}.`}
        />
      </div>

      <AppConfigForm
        appId={applicationId}
        canUpdate={canUpdateConfig}
        hasSecretKey={config.hasSecretKey}
        initialAccess={config.access}
        initialTokenFields={config.tokenFields}
        initialParty={config.party}
        initialOrigins={config.silentSsoOrigins}
        initialServerIps={config.serverIps}
        initialAccountUpdateWebhookUrl={config.accountUpdateWebhookUrl}
        initialRoleUpdateWebhookUrl={config.roleUpdateWebhookUrl}
        initialAllowDevMode={config.allowDevMode}
        initialAllowDevIpMode={config.allowDevIpMode}
        initialDefinedScopes={config.definedScopes}
        initialAllowMultipleDefinedScopes={config.allowMultipleDefinedScopes}
        initialApplicableForDefinitions={config.applicableForDefinitions}
      />
    </div>
  );
}
