import { notFound } from 'next/navigation';
import { BackButton } from '#/components/ui/back-button';
import { checkPermissions } from '@/services/user';
import { getSocialLinks } from '@/services/manage/site/socials';
import { SocialLinksManager } from '../../../config/socials/social-links-manager';
import { permission } from '@/.neup/logica/permission';

const pagePermissions = [
  permission('site.socials.read', 'for_individual', 'page'),
  permission('site.socials.update', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-site-config-socials-page
 * ::title Site Social Links Manage Page
 *
 * Renders the root-managed interface for listing and updating footer social links.
 *
 * ::public
 *
 * Users need `site.socials.read` to view the page, while `site.socials.update` also unlocks the editing actions inside the manager.
 *
 * ::public end
 *
 * ::private
 *
 * The page accepts root-managed access because permission checks flow through the selected-account access model before loading the social-link service.
 *
 * ::private end
 *
 * ::end
 */
export default async function SiteConfigSocialsPage() {
  const canView =
    (await checkPermissions(['site.socials.read'])) ||
    (await checkPermissions(['site.socials.update']));
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
