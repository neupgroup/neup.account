import type { Metadata } from 'next';
import { ApplicationUsersPage } from '@/app/(manage)/application/_route-impl/users/page';
import { formMetadata } from '#/core/metadata';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import {
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string; role?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid } = await params;
  const { mode } = await searchParams;
  const details = await getApplicationDetailsForViewerV2(appid, {
    rootMode: mode === 'root',
    rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
  });
  return formMetadata({
    title: details?.name ? `Users, ${details.name} Management` : 'Users, Application Management',
  });
}

export default async function ApplicationUsersCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode, role } = await searchParams;
  return ApplicationUsersPage({ applicationId: appid, mode, role: getQueryParam(role) });
}
