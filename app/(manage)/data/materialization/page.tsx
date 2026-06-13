import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import MaterializationPage from './page.client';

export default async function MaterializationDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.materialization);
  return <MaterializationPage />;
}
