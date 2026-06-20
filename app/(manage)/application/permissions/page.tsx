import { notFound } from 'next/navigation';
import LegacyApplicationPermissionsPage from '@/app/(manage)/application/[id]/permissions/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[]; mode?: string }>;
};

export default async function ApplicationPermissionsQueryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (!applicationId) notFound();

  return LegacyApplicationPermissionsPage({
    params: Promise.resolve({ id: applicationId }),
    searchParams: Promise.resolve({ mode: resolvedSearchParams.mode }),
  });
}
