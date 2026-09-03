import { notFound } from 'next/navigation';
import { BackButton } from '#/components/element/backButton';
import { checkPermissions } from '@/services/user';
import { getSiteLogoUrl } from '@/services/manage/site/logo';
import { AppLogoForm } from '../../../config/app/app-logo-form.client';
import { permission } from '@/.neup/logica/permission';

const pagePermissions = [
  permission('root.payment_config.view', 'for_individual', 'page'),
];

export default async function SiteConfigAppPage() {
  const canView = await checkPermissions(['root.payment_config.view']);
  if (!canView) {
    notFound();
  }

  const initialSiteLogoUrl = await getSiteLogoUrl();

  return (
    <div className="grid gap-8">
      <BackButton href="/site/config" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">App Settings</h1>
        <p className="text-muted-foreground">
          Update the site logo used in the header and other application surfaces.
        </p>
      </div>
      <AppLogoForm initialSiteLogoUrl={initialSiteLogoUrl} />
    </div>
  );
}
