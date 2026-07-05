
import { assertHasProfileDisplayPermission } from '@/neup.core/auth/profile-permissions';
import ManagedUserDisplayPage from './page.client';
import { permission } from '@/logica/permission';

const pagePermissions = [
  permission('profile.display.view.self', 'for_individual', 'page'),
  permission('profile.display.view.managed', 'for_individual', 'page'),
  permission('profile.display.view.root', 'for_individual', 'page'),
];

type ManagedUserDisplayPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManagedUserDisplayPageWrapper({ params }: ManagedUserDisplayPageProps) {
  const { id } = await params;
  await assertHasProfileDisplayPermission(id, 'view');
  return <ManagedUserDisplayPage />;
}
