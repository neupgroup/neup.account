import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { checkPermissions } from '@/services/user';
import { getResources } from '@/services/manage/site/resources';
import { DisplayImagesManager } from '../../../config/displayImages/display-images-manager.client';
import { permission } from '@/logica/permission';

const pagePermissions = [
  permission('root.display_images.view', 'for_individual', 'page'),
  permission('root.display_images.add', 'for_individual', 'page'),
  permission('root.display_images.delete', 'for_individual', 'page'),
  permission('root.display_images.update', 'for_individual', 'page'),
];

export default async function SiteConfigDisplayImagesPage() {
  const canView = await checkPermissions(['root.display_images.view']);
  if (!canView) {
    notFound();
  }

  const resources = await getResources();
  const canAdd = await checkPermissions(['root.display_images.add']);
  const canDelete = await checkPermissions(['root.display_images.delete']);
  const canUpdate = await checkPermissions(['root.display_images.update']);

  return (
    <div className="grid gap-8">
      <BackButton href="/site/config" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Display Images</h1>
        <p className="text-muted-foreground">
          Manage image resources used for profile photos, public illustrations, and future image categories.
        </p>
      </div>
      <DisplayImagesManager
        initialResources={resources}
        canAdd={canAdd}
        canDelete={canDelete}
        canUpdate={canUpdate}
      />
    </div>
  );
}
