import { redirect } from 'next/navigation';

/**
 * ::neup.documentation::managed-account-access-redirect-page
 * ::title Managed Account Access Redirect Page
 *
 * Redirects legacy managed-account access routes to the shared selected-account access interface.
 *
 * ::public
 *
 * `/manage/[id]/access` now forwards to `/access?account=[id]` so team, connection, application, family, invitation, and blocked-account navigation can preserve the selected account in the query string.
 *
 * ::public end
 *
 * ::private
 *
 * The destination access page performs the permission checks and returns `notFound()` when the signed-in profile cannot view the selected account access surface.
 *
 * ::private end
 *
 * ::end
 */
export default async function ManagedAccountAccessRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/access?account=${encodeURIComponent(id)}`);
}
