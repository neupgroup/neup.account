import { notFound } from 'next/navigation';
import LegacyApplicationUsersPage from '@/app/(manage)/application/[id]/users/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUsersQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationUsersPage({ params: Promise.resolve({ id: applicationId }) });
}
