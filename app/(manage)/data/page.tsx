import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_NAV_PERMISSIONS } from '@/core/auth/data-permissions';
import DataAndPrivacyPage from './page.client';

export default async function DataPage() {
  await requireAnyPermission404(DATA_PRIVACY_NAV_PERMISSIONS);
  return <DataAndPrivacyPage />;
}
