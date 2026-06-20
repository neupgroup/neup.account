import { notFound } from 'next/navigation';
import LegacyApplicationRolesPage from '@/app/(manage)/application/[id]/roles/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationRolesQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationRolesPage({ params: Promise.resolve({ id: applicationId }) });
}
