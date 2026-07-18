import type { Metadata } from 'next';
import { ApplicationPermissionsPage } from '@/app/(manage)/application/_route-impl/permissions/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { formMetadata } from '@/core/metadata';
import { getAppPermissions } from '@/services/applications/authz-manage';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string; permission?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid } = await params;
  const { mode, permission } = await searchParams;
  const permissionId = getQueryParam(permission);
  const details = await getApplicationDetailsForViewerV2(appid, { rootMode: mode === 'root' });

  if (!permissionId) {
    return formMetadata({
      title: details?.name ? `Permissions, ${details.name} Management` : 'Permissions, Application Management',
    });
  }

  const permissions = await getAppPermissions(appid);
  const selectedPermission = permissions.find((item) => item.id === permissionId);
  return formMetadata({
    title: [
      selectedPermission?.name ?? 'Permission',
      'Permissions',
      details?.name ? `${details.name} Management` : 'Application Management',
    ].join(', '),
  });
}

export default async function ApplicationPermissionsCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode, permission } = await searchParams;
  return ApplicationPermissionsPage({
    applicationId: appid,
    permissionId: getQueryParam(permission),
    mode,
  });
}
