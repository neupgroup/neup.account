
import { assertHasProfileDisplayPermission } from '@/core/auth/profile-permissions';
import ManagedUserDisplayPage from './page.client';

type ManagedUserDisplayPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManagedUserDisplayPageWrapper({ params }: ManagedUserDisplayPageProps) {
  const { id } = await params;
  await assertHasProfileDisplayPermission(id, 'view');
  return <ManagedUserDisplayPage />;
}
