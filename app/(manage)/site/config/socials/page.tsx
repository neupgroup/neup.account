import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { checkPermissions } from '@/services/user';
import { getSocialLinks } from '@/services/manage/site/socials';
import { SocialLinksManager } from '../../../config/socials/social-links-manager';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
  permission('root.payment_config.view', 'for_individual', 'page'),
];

export default async function SiteConfigSocialsPage() {
  const canView = await checkPermissions(['root.payment_config.view']);
  if (!canView) {
    notFound();
  }

  const initialLinks = await getSocialLinks();

  return (
    <div className="grid gap-8">
      <BackButton href="/site/config" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Footer Social Accounts</h1>
        <p className="text-muted-foreground">
          Add and manage social media links shown in the website footer.
        </p>
      </div>
      <SocialLinksManager initialLinks={initialLinks} />
    </div>
  );
}
