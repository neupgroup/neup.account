import { permission } from '@/neup.logica/permission';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import DeactivateAccountPage from './page.client';

const pagePermissions = [
  permission('data.deactivate_account.start', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-data-deactivate-page
 * ::title Deactivate Account Page
 *
 * Server entry point for the account-deactivation flow.
 *
 * ::public
 *
 * This page checks deactivation access and renders the client UI for starting account deactivation.
 *
 * ::public end
 *
 * ::private
 *
 * Access failures resolve through `requireAnyPermission404()` rather than a visible permission error.
 *
 * ::private end
 *
 * ::end
 */
export default async function DeactivateDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deactivateAccount);
  return <DeactivateAccountPage />;
}
