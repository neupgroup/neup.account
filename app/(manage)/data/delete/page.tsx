import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import DeleteAccountPage from './page.client';
import { permission } from '@/logica/permission';

const pagePermissions = [
  permission('data.delete_account.start', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-data-delete-page
 * ::title Delete Account Page
 *
 * Server entry point for the account deletion flow.
 *
 * ::public
 *
 * This page checks delete-account access and renders the client UI for starting permanent account deletion.
 *
 * ::public end
 *
 * ::private
 *
 * Access is enforced through the shared data-privacy permission group and hidden behind `requireAnyPermission404()`.
 *
 * ::private end
 *
 * ::end
 */
export default async function DeleteDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deleteAccount);
  return <DeleteAccountPage />;
}
