import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '#/components/ui/card';
import { Shield, ChevronRight } from '@/components/icons';
import { getDirectMembers } from '@/services/manage/access';
import prisma from '@/.neup/core/database/prisma';
import { getUserProfile, isRootUser } from '@/services/user';
import { resolveAssetName } from '@/services/manage/access/asset-resolvers';
import { AssetMemberLookupForm } from '../_components/asset-member-lookup-form';
import { AddUserForm } from '../add-user-form';
import { FlowLink } from '@/components/flow-link';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { formMetadata } from '#/core/metadata';
import { ACCESS_TEAM_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { permission } from '@/.neup/logica/permission';
import { resolveAccessProfileContext } from '@/services/account/access-profile-context';

const pagePermissions = [
  permission('access.team.view.self', 'for_individual', 'page'),
];

type PageProps = {
  searchParams: Promise<{ portfolio?: string; asset?: string; mode?: string; workingProfile?: string; selectedProfile?: string }>;
};

export const metadata: Metadata = formMetadata({ title: 'Team Management' });

type MemberStatus = 'active' | 'invited' | 'on_hold' | 'expired';

type MemberCardRow = {
  id: string;
  name: string;
  description: string;
  status: MemberStatus;
  isSelf?: boolean;
  actionHref: string;
};

function appendAccessContext(
  href: string,
  context: { selectedProfile?: string; mode?: string; workingProfile?: string },
) {
  const params = new URLSearchParams();
  const [pathname, query = ''] = href.split('?', 2);
  const existingParams = new URLSearchParams(query);

  existingParams.forEach((value, key) => {
    params.append(key, value);
  });
  if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
  if (context.mode) params.set('mode', context.mode);
  if (context.workingProfile) params.set('workingProfile', context.workingProfile);

  return `${pathname}?${params.toString()}`;
}

function MembersCards({ rows }: { rows: MemberCardRow[] }) {
  const dotClassByStatus: Record<MemberStatus, string> = {
    active: 'bg-emerald-500',
    invited: 'bg-blue-500',
    on_hold: 'bg-muted-foreground',
    expired: 'bg-muted-foreground',
  };

  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {row.name}
                {row.isSelf ? ' (you)' : ''}
              </p>
              {!row.isSelf && (row.status === 'active' || row.status === 'invited') && (
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClassByStatus[row.status]}`}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
          </div>
          <FlowLink href={row.actionHref} className="inline-flex items-center gap-1 text-sm font-medium">
                Open
                <ChevronRight className="h-4 w-4" />
          </FlowLink>
        </div>
      ))}
    </div>
  );
}

function MembersLayout({
  backHref,
  description,
  addForm,
  content,
}: {
  backHref: string;
  description: string;
  addForm: React.ReactNode;
  content: React.ReactNode;
}) {
  return (
    <div className="grid gap-8">
      <BackButton href={backHref} />

      <PrimaryHeader
        title="Members with Access"
        description={description}
      />

      <div className="grid gap-3">
        {addForm}

        <Card>
          <CardContent className="p-0">{content}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyMembers({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Shield className="h-6 w-6 text-muted-foreground" />
      </span>
      <p className="font-medium">No members yet</p>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

/**
 * ::neup.documentation::access-team-page
 * ::title Access Team Page
 *
 * Renders the team-management views for direct profile access, portfolio members, and asset-member lookups.
 *
 * ::public
 *
 * The page accepts `selectedProfile`, `portfolio`, `asset`, `mode`, and `workingProfile` query parameters. Local navigation keeps the selected-profile context intact.
 *
 * ::public end
 *
 * ::private
 *
 * Each branch appends `selectedProfile` and `workingProfile` to child routes because downstream access pages resolve the selected and acting profile from those query params rather than from the default session context.
 *
 * ::private end
 *
 * ::end
 */
async function DirectAccountPage({
  accountId,
  mode,
  workingProfile,
}: {
  accountId: string;
  mode?: string;
  workingProfile?: string;
}) {
  const { accountName, members } = await getDirectMembers(accountId, { skipPermissionCheck: true });
  const hrefContext = { selectedProfile: accountId, mode, workingProfile };

  return (
    <MembersLayout
      backHref={appendAccessContext('/access', hrefContext)}
      description={`Members with access to profile "${accountName}"`}
      addForm={<AddUserForm />}
      content={
        members.length > 0 ? (
          <MembersCards
            rows={members.map((member) => ({
              id: `account:${accountId}:${member.accountId}`,
              name: member.displayName,
              description:
                member.accountId === accountId
                  ? 'You have the full access to your account and no one can remove you from your profile.'
                  : member.status === 'invited'
                    ? 'Invitation pending'
                    : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}, ${member.isPermanent ? 'permanent' : 'temporary'} account`,
              status: member.status,
              isSelf: member.accountId === accountId,
              actionHref: appendAccessContext(`/access/assign?account=${member.accountId}`, hrefContext),
            }))}
          />
        ) : (
          <EmptyMembers message="Use the form above to invite someone by NeupID." />
        )
      }
    >
    </MembersLayout>
  );
}

async function AssetMembersPage({
  assetRef,
  accountId,
  rootMode,
  mode,
  workingProfile,
}: {
  assetRef: string;
  accountId: string;
  rootMode: boolean;
  mode?: string;
  workingProfile?: string;
}) {
  const hrefContext = { selectedProfile: accountId, mode, workingProfile };

  const toLogicalAssetId = (row: {
    id: string;
    member_account_id: string | null;
    access_application_id: string | null;
    member_connection_id: string | null;
  }) => row.member_account_id ?? row.access_application_id ?? row.member_connection_id ?? row.id;

  const resolved = await prisma.asset.findFirst({
    where: {
      OR: [
        { id: assetRef },
        { member_account_id: assetRef },
        { access_application_id: assetRef },
        { member_connection_id: assetRef },
      ],
    },
      select: {
        id: true,
        member_account_id: true,
        access_application_id: true,
        member_connection_id: true,
      access_type: true,
    },
  });

  if (!resolved) notFound();
  const resolvedAssetId = toLogicalAssetId(resolved);

  const allRows = await prisma.asset.findMany({
    where: {
      OR: [
        { member_account_id: resolvedAssetId },
        { access_application_id: resolvedAssetId },
        { member_connection_id: resolvedAssetId },
      ],
      access_type: resolved.access_type,
    },
    select: { id: true },
  });

  if (allRows.length === 0) notFound();

  const rowIds = allRows.map((r) => r.id);
  if (!rootMode) {
    const canView = await prisma.member.findFirst({
      where: { memberAccountId: accountId },
      select: { id: true },
    });
    if (!canView) notFound();
  }

  const asset = await resolveAssetName(resolvedAssetId, resolved.access_type);
  const assetName = asset.name;
  const rootAssetLabel = rootMode ? 'Root asset' : 'Asset members';

  return (
    <MembersLayout
      backHref={appendAccessContext('/access', hrefContext)}
      description={`${rootAssetLabel} for ${assetName}`}
      addForm={<AssetMemberLookupForm assetId={resolvedAssetId} rootMode={rootMode} />}
      content={
        allRows.length > 0 ? (
          <MembersCards
            rows={allRows.map((row) => ({
              id: row.id,
              name: assetName,
              description: 'Direct asset access',
              status: 'active',
              actionHref: appendAccessContext(`/access/team?asset=${encodeURIComponent(row.id)}`, hrefContext),
            }))}
          />
        ) : (
          <EmptyMembers message="No asset members found." />
        )
      }
    >
    </MembersLayout>
  );
}

export default async function TeamPage({ searchParams }: PageProps) {
  const { portfolio, asset, mode, workingProfile, selectedProfile } = await searchParams;
  const accessContext = await resolveAccessProfileContext({
    selectedProfile,
    workingProfile,
    requiredPermissions: ACCESS_TEAM_VIEW_PERMISSIONS,
  });

  if (!accessContext) notFound();

  if (asset) {
    return (
      <AssetMembersPage
        assetRef={asset}
        accountId={accessContext.selectedProfile}
        rootMode={mode === 'root'}
        mode={mode}
        workingProfile={workingProfile}
      />
    );
  }

  if (portfolio) {
    notFound();
  }

  return (
    <DirectAccountPage
      accountId={accessContext.selectedProfile}
      mode={mode}
      workingProfile={workingProfile}
    />
  );
}
