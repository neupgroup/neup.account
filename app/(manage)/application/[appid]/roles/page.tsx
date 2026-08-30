import type { Metadata } from 'next';
import { ApplicationRolesPage } from '@/app/(manage)/application/_route-impl/roles/page';
import { formMetadata } from '#/core/metadata';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid } = await params;
  const { mode } = await searchParams;
  const details = await getApplicationDetailsForViewerV2(appid, { rootMode: mode === 'root' });
  return formMetadata({
    title: details?.name
      ? `Roles & Permissions, ${details.name} Management`
      : 'Roles & Permissions, Application Management',
  });
}

export default async function ApplicationRolesCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  return ApplicationRolesPage({ applicationId: appid, mode });
}
