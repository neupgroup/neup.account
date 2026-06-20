import { notFound } from 'next/navigation';
import LegacyApplicationLogsPage from '@/app/(manage)/application/[id]/logs/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{
    application?: string | string[];
    page?: string;
    pageSize?: string;
    mode?: string;
  }>;
};

export default async function ApplicationLogsQueryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (!applicationId) notFound();

  return LegacyApplicationLogsPage({
    params: Promise.resolve({ id: applicationId }),
    searchParams: Promise.resolve({
      page: resolvedSearchParams.page,
      pageSize: resolvedSearchParams.pageSize,
      mode: resolvedSearchParams.mode,
    }),
  });
}
