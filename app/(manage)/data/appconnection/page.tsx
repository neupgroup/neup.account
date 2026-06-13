import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import ApplicationsPage from './page.client';

export default async function ApplicationConnectionsDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.appConnections);
  return <ApplicationsPage />;
}
