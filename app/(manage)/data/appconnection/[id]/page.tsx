import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/inapp/permissions/data-permissions';
import ApplicationDetailPage from './page.client';
import { permission } from '@/.neup/logica/permission';

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
