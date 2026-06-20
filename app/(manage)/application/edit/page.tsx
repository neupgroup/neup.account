import { notFound } from 'next/navigation';
import LegacyApplicationEditPage from '@/app/(manage)/application/[id]/edit/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationEditQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationEditPage({ params: Promise.resolve({ id: applicationId }) });
}
