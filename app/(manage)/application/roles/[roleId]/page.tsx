import { notFound } from 'next/navigation';
import LegacyRoleDetailsPage from '@/app/(manage)/application/[id]/roles/[roleId]/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ application?: string | string[] }>;
};

export default async function RoleDetailsQueryPage({ params, searchParams }: Props) {
  const { roleId } = await params;
  const { application } = await searchParams;
  const applicationId = getQueryParam(application);

  if (!applicationId) notFound();

  return LegacyRoleDetailsPage({
    params: Promise.resolve({ id: applicationId, roleId }),
  });
}
