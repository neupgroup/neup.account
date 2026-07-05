import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ChevronRight } from '@/components/icons';
import { getDirectMembers } from '@/services/manage/access';
import { getActiveAccountId } from '@/neup.core/auth/verify';
import prisma from '@/neup.core/helpers/prisma';
import { getUserProfile, isRootUser } from '@/services/user';
import { resolveAssetName } from '@/services/manage/access/asset-resolvers';
import { AddMemberForm } from '../_components/add-member-form';
import { AssetMemberLookupForm } from '../_components/asset-member-lookup-form';
import { AddUserForm } from '../add-user-form';
import { FlowLink } from '@/components/ui/flow-link';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { createPageMetadata } from '@/neup.core/metadata';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { ACCESS_TEAM_VIEW_PERMISSIONS } from '@/neup.core/auth/access-view-permissions';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
  permission('access.team.view.self', 'for_individual', 'page'),
];

type PageProps = {
  searchParams: Promise<{ portfolio?: string; asset?: string; mode?: string; workingProfile?: string }>;
};

export const metadata: Metadata = createPageMetadata('Team Management');

type MemberStatus = 'active' | 'invited' | 'on_hold' | 'expired';

type MemberCardRow = {
  id: string;
  name: string;
  description: string;
  status: MemberStatus;
  isSelf?: boolean;
  actionHref: string;
};

function appendWorkingProfile(href: string, workingProfile?: string) {
  if (!workingProfile) return href;

  const params = new URLSearchParams();
  const [pathname, query = ''] = href.split('?', 2);
  const existingParams = new URLSearchParams(query);

  existingParams.forEach((value, key) => {
    params.append(key, value);
  });
  params.set('workingProfile', workingProfile);

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
 * The page accepts `portfolio`, `asset`, `mode`, and `workingProfile` query parameters. When `workingProfile` is present, all local navigation keeps that profile-selection context intact.
 *
 * ::public end
 *
 * ::private
 *
 * Each branch appends `workingProfile` to child routes because downstream access pages resolve the acting profile from that query param rather than from the default session context.
 *
 * ::private end
 *
 * ::end
 */
async function DirectAccountPage({ workingProfile }: { workingProfile?: string }) {
  const accountId = await getActiveAccountId(workingProfile);
  if (!accountId) notFound();

  const { accountName, members } = await getDirectMembers(accountId);

  return (
    <MembersLayout
      backHref={appendWorkingProfile('/access', workingProfile)}
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
              actionHref: appendWorkingProfile(`/access/assign?account=${member.accountId}`, workingProfile),
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
  rootMode,
  workingProfile,
}: {
  assetRef: string;
  rootMode: boolean;
  workingProfile?: string;
}) {
  const accountId = await getActiveAccountId(workingProfile);
  if (!accountId) notFound();

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
      backHref={appendWorkingProfile('/access', workingProfile)}
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
              actionHref: appendWorkingProfile(`/access/team?asset=${encodeURIComponent(row.id)}`, workingProfile),
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
  await requireAnyPermission404([...ACCESS_TEAM_VIEW_PERMISSIONS]);
  const { portfolio, asset, mode, workingProfile } = await searchParams;

  if (asset) {
    return <AssetMembersPage assetRef={asset} rootMode={mode === 'root'} workingProfile={workingProfile} />;
  }

  if (portfolio) {
    notFound();
  }

  return <DirectAccountPage workingProfile={workingProfile} />;
}
