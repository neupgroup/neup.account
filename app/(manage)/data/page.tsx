import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/logica/account/permission-guards';
import { DATA_PRIVACY_NAV_PERMISSIONS } from '@/logica/account/data-permissions';
import DataAndPrivacyPage from './page.client';

const pagePermissions = [
  permission('data.agreed_terms.view', 'for_individual', 'page'),
  permission('data.delete_account.start', 'for_individual', 'page'),
  permission('data.deactivate_account.start', 'for_individual', 'page'),
  permission('data.materialization.view', 'for_individual', 'page'),
  permission('data.materialization.modify', 'for_individual', 'page'),
  permission('access.connection.view.self', 'for_individual', 'page'),
  permission('access.application.view.self', 'for_individual', 'page'),
  permission('security.recent_activities.view', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-data-page
 * ::title Data And Privacy Landing Page
 *
 * Server entry point for the account data-and-privacy hub.
 *
 * ::public
 *
 * This page gates access to the data/privacy navigation and then renders the client page that lists available privacy actions.
 *
 * ::public end
 *
 * ::private
 *
 * Authorization is enforced through `requireAnyPermission404()` using the shared data-privacy navigation permission group.
 *
 * ::private end
 *
 * ::end
 */
export default async function DataPage() {
  await requireAnyPermission404(DATA_PRIVACY_NAV_PERMISSIONS);
  return <DataAndPrivacyPage />;
}
