import { notFound } from 'next/navigation';
import LegacyAddRolePage from '@/app/(manage)/application/[id]/roles/add/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function AddRoleQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyAddRolePage({ params: Promise.resolve({ id: applicationId }) });
}
