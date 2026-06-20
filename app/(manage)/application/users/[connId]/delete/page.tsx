import { notFound } from 'next/navigation';
import LegacyApplicationUserDeletePage from '@/app/(manage)/application/[id]/users/[connId]/delete/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationUserDeleteQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationUserDeletePage({
    params: Promise.resolve({ id: applicationId, connId }),
  });
}
