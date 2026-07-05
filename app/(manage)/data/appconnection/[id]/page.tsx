import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/neup.core/auth/data-permissions';
import ApplicationDetailPage from './page.client';
import { permission } from '@/logica/permission';

const pagePermissions = [
  permission('access.connection.view.self', 'for_individual', 'page'),
  permission('access.application.view.self', 'for_individual', 'page'),
];

type ApplicationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ApplicationConnectionsDetailDataPage({ params }: ApplicationDetailPageProps) {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.appConnections);
  return <ApplicationDetailPage params={params} />;
}
