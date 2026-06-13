import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import ApplicationDetailPage from './page.client';

type ApplicationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ApplicationConnectionsDetailDataPage({ params }: ApplicationDetailPageProps) {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.appConnections);
  return <ApplicationDetailPage params={params} />;
}
