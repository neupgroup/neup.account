import { notFound } from 'next/navigation';
import { getApplicationDetailsForViewerV2, getAppConfigData } from '@/services/applications/manage';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { AppConfigForm } from '@/app/(manage)/application/_components/app-config-form';

type Props = { params: Promise<{ id: string }> };

export default async function ApplicationConfigPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  if (!details.canDelete) {
    return (
      <div className="grid gap-8">
        <div className="space-y-4">
          <BackButton href={`/application/${id}`} />
          <PrimaryHeader title="Configuration" description="API and access configuration." />
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only the application owner can configure this application.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const config = await getAppConfigData(id);
  if (!config) notFound();

  return (
    <div className="grid gap-8">
      <div className="space-y-4">
        <BackButton href={`/application/${id}`} />
        <PrimaryHeader
          title="Configuration"
          description={`API secret, response fields, token fields, and SSO origins for ${details.name}.`}
        />
      </div>

      <AppConfigForm
        appId={id}
        hasSecretKey={config.hasSecretKey}
        initialAccess={config.access}
        initialTokenFields={config.tokenFields}
        initialOrigins={config.silentSsoOrigins}
        initialAllowDevMode={config.allowDevMode}
      />
    </div>
  );
}
