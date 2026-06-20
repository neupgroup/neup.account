import { notFound } from 'next/navigation';
import LegacyApplicationUserActivityPage from '@/app/(manage)/application/[id]/users/[connId]/activity/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserActivityQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationUserActivityPage({
    params: Promise.resolve({ id: applicationId, connId }),
  });
}
