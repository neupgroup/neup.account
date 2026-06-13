import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import DeleteAccountPage from './page.client';

export default async function DeleteDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deleteAccount);
  return <DeleteAccountPage />;
}
