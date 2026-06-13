import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import DeactivateAccountPage from './page.client';

export default async function DeactivateDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deactivateAccount);
  return <DeactivateAccountPage />;
}
