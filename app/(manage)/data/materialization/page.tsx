import { permission } from '@/logica/permission';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { DATA_PRIVACY_PERMISSION_GROUPS } from '@/core/auth/data-permissions';
import MaterializationPage from './page.client';

const pagePermissions = [
  permission('data.materialization.view', 'for_individual', 'page'),
  permission('data.materialization.modify', 'for_individual', 'page'),
];

/**
 * ::neup.documentation::manage-data-materialization-page
 * ::title Materialization Page
 *
 * Server entry point for scheduled account deletion and inactivity-based materialization settings.
 *
 * ::public
 *
 * This page checks materialization permissions and renders the client UI for viewing or updating the scheduled deletion flow.
 *
 * ::public end
 *
 * ::private
 *
 * The server page owns permission gating only; the interactive behavior lives in the adjacent client page.
 *
 * ::private end
 *
 * ::end
 */
export default async function MaterializationDataPage() {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.materialization);
  return <MaterializationPage />;
}
