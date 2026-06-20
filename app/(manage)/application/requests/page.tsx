import { notFound } from 'next/navigation';
import LegacyApplicationRequestsPage from '@/app/(manage)/application/[id]/requests/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationRequestsQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationRequestsPage({ params: Promise.resolve({ id: applicationId }) });
}
