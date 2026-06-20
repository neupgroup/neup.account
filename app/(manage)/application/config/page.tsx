import { notFound } from 'next/navigation';
import LegacyApplicationConfigPage from '@/app/(manage)/application/[id]/config/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function ApplicationConfigQueryPage({ searchParams }: Props) {
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyApplicationConfigPage({ params: Promise.resolve({ id: applicationId }) });
}
