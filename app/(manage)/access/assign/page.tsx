import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { getUserProfile } from '@/services/user';
import { getAccessAssetGroup } from '@/services/manage/access/assets';
import { bulkAssignPermissionsFromForm } from '@/services/manage/access/actions';
import { AssignPermissionsWizard } from '../_components/assign-permissions-wizard';

type PageProps = {
  searchParams: Promise<{ portfolio?: string; member?: string; mode?: string }>;
};

export default async function AssignPermissionsPage({ searchParams }: PageProps) {
  const { portfolio, member } = await searchParams;
  if (!portfolio) notFound();

  const group = await getAccessAssetGroup(portfolio);
  if (!group) notFound();

  const activeMembers = group.members.filter((m) => m.status === 'active');
  const members = await Promise.all(
    activeMembers.map(async (m) => {
      const profile = await getUserProfile(m.accountId);
      const displayName =
        profile?.nameDisplay ||
        (profile?.nameFirst || profile?.nameLast
          ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
          : null) ||
        m.accountId;
      return { id: m.id, accountId: m.accountId, displayName };
    })
  );

  const action = bulkAssignPermissionsFromForm.bind(null, portfolio);
  const existingAssetIds = Array.from(new Set(group.assets.map((a) => a.assetId)));

  return (
    <div className="grid gap-8">
      <BackButton href={`/access?portfolio=${portfolio}`} />
      <PrimaryHeader
        title="Assign Asset Roles"
        description={`Assign one or more roles on portfolio assets in "${group.name}".`}
      />
      <Card>
        <CardContent className="p-0">
          <AssignPermissionsWizard
            action={action}
            members={members}
            existingAssetIds={existingAssetIds}
            groupId={portfolio}
            initialMemberAccountId={member}
          />
        </CardContent>
      </Card>
    </div>
  );
}
