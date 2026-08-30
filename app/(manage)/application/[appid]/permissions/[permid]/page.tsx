import type { Metadata } from 'next';
import { ApplicationPermissionsPage } from '@/app/(manage)/application/_route-impl/permissions/page';
import { formMetadata } from '#/core/metadata';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';

/*
::neup.documentation::manage-application-permission-detail-route
::title Application Permission Detail Route

Renders one application permission at the canonical nested permission URL.

::public

This route serves `/application/[appid]/permissions/[permid]` and preserves `mode=root` as a query parameter.

::public end

::end
*/

type Props = {
  params: Promise<{ appid: string; permid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid, permid } = await params;
  const { mode } = await searchParams;
  const details = await getApplicationDetailsForViewerV2(appid, { rootMode: mode === 'root' });
  const permissions = await getAppPermissions(appid);
  const permission = permissions.find((item) => item.id === permid);

  return formMetadata({
    title: [
      permission?.name ?? 'Permission',
      'Permissions',
      details?.name ? `${details.name} Management` : 'Application Management',
    ].join(', '),
  });
}

export default async function ApplicationPermissionDetailCanonicalPage({ params, searchParams }: Props) {
  const { appid, permid } = await params;
  const { mode } = await searchParams;

  return ApplicationPermissionsPage({
    applicationId: appid,
    permissionId: permid,
    mode,
  });
}
