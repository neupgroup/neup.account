import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ApplicationPermissionsPage } from '@/app/(manage)/application/_route-impl/permissions/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { formMetadata } from '@/core/metadata';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string; permission?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid } = await params;
  const { mode } = await searchParams;
  const details = await getApplicationDetailsForViewerV2(appid, { rootMode: mode === 'root' });

  return formMetadata({
    title: details?.name ? `Permissions, ${details.name} Management` : 'Permissions, Application Management',
  });
}

export default async function ApplicationPermissionsCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode, permission } = await searchParams;
  const permissionId = getQueryParam(permission);

  if (permissionId) {
    const query = mode ? `?mode=${encodeURIComponent(mode)}` : '';
    redirect(`/application/${encodeURIComponent(appid)}/permissions/${encodeURIComponent(permissionId)}${query}`);
  }

  return ApplicationPermissionsPage({
    applicationId: appid,
    mode,
  });
}
