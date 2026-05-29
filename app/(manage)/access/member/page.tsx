import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ChevronRight } from '@/components/icons';
import { getPortfolioMembers, getDirectMembers } from '@/services/manage/access';
import { getActiveAccountId } from '@/core/auth/verify';
import prisma from '@/core/helpers/prisma';
import { getUserProfile, isRootUser } from '@/services/user';
import { resolveAssetName } from '@/services/manage/access/asset-resolvers';
import { AddMemberForm } from '../_components/add-member-form';
import { AssetMemberLookupForm } from '../_components/asset-member-lookup-form';
import { AddUserForm } from '../add-user-form';
import { FlowLink } from '@/components/ui/flow-link';
import { PrimaryHeader } from '@/components/ui/primary-header';

type PageProps = {
  searchParams: Promise<{ portfolio?: string; asset?: string; mode?: string }>;
};

type MemberStatus = 'active' | 'invited' | 'on_hold' | 'expired';

type MemberCardRow = {
  id: string;
  name: string;
  description: string;
  status: MemberStatus;
  isSelf?: boolean;
  actionHref: string;
};

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

// ── Shared page layout ────────────────────────────────────────────────────────

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

// ── Empty state ───────────────────────────────────────────────────────────────

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

// ── Portfolio members view ────────────────────────────────────────────────────

async function PortfolioAccountPage({ id }: { id: string }) {
  const { portfolioName, members } = await getPortfolioMembers(id);
  if (!portfolioName) notFound();

  return (
    <MembersLayout
      backHref={`/access?portfolio=${id}`}
      description={`Members with access to portfolio "${portfolioName}"`}
      addForm={<AddMemberForm parentPortfolioId={id} />}
      content={
        members.length > 0 ? (
          <MembersCards
            rows={members.map((member) => ({
              id: `portfolio:${id}:${member.accountId}`,
              name: member.displayName,
              description:
                member.roleCount === 0
                  ? 'No roles assigned'
                  : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}`,
              status: member.status,
              actionHref: `/access/role?portfolio=${id}&member_id=${member.accountId}`,
            }))}
          />
        ) : (
          <EmptyMembers message="Add a member above using their NeupID." />
        )
      }
    >
    </MembersLayout>
  );
}

// ── Direct access members view ────────────────────────────────────────────────

async function DirectAccountPage() {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const { accountName, members } = await getDirectMembers(accountId);

  return (
    <MembersLayout
      backHref="/access"
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
                  : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}, ${member.isPermanent ? 'permanent' : 'temporary'} account`,
              status: member.status,
              isSelf: member.accountId === accountId,
              actionHref: `/access/role?member_id=${member.accountId}`,
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

// ── Asset members view ────────────────────────────────────────────────────────

async function AssetMembersPage({ assetRef, rootMode }: { assetRef: string; rootMode: boolean }) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const toLogicalAssetId = (row: {
    id: string;
    childAccountId: string | null;
    childApplicationId: string | null;
    childConnectionId: string | null;
  }) => row.childAccountId ?? row.childApplicationId ?? row.childConnectionId ?? row.id;

  const resolved = await prisma.asset.findFirst({
    where: {
      OR: [
        { id: assetRef },
        { childAccountId: assetRef },
        { childApplicationId: assetRef },
        { childConnectionId: assetRef },
      ],
    },
    select: {
      id: true,
      childAccountId: true,
      childApplicationId: true,
      childConnectionId: true,
      assetType: true,
    },
  });

  if (!resolved) notFound();
  const resolvedAssetId = toLogicalAssetId(resolved);

  const allRows = await prisma.asset.findMany({
    where: {
      OR: [
        { childAccountId: resolvedAssetId },
        { childApplicationId: resolvedAssetId },
        { childConnectionId: resolvedAssetId },
      ],
      assetType: resolved.assetType,
    },
    select: { id: true, parentPortfolioId: true },
  });

  if (allRows.length === 0) notFound();

  const rowIds = allRows.map((r) => r.id);
  const portfolioIds = Array.from(
    new Set(allRows.map((r) => r.parentPortfolioId).filter((id): id is string => Boolean(id))),
  );

  if (!rootMode) {
    const canView = await prisma.member.findFirst({
      where: {
        memberAccountId: accountId,
        parentPortfolioId: { in: portfolioIds },
      },
      select: { id: true },
    });
    if (!canView) notFound();
  }

  let grants: Array<{ id: string; account_id: string }> = [];
  try {
    grants = await prisma.authzAssetsAccessGrant.findMany({
      where: {
        asset_id: { in: rowIds },
        app_id: 'neup.account',
        ...(rootMode
          ? {
              OR: [{ portfolio_id: { in: portfolioIds } }, { portfolio_id: null }],
            }
          : { portfolio_id: { in: portfolioIds } }),
      },
      select: {
        id: true,
        account_id: true,
      },
      orderBy: { account_id: 'asc' },
    });
  } catch (error) {
    const e = error as { code?: string };
    if (e?.code !== 'P2021' && e?.code !== 'P2022') throw error;
  }

  const grouped = new Map<string, number>();
  for (const grant of grants) {
    grouped.set(grant.account_id, (grouped.get(grant.account_id) ?? 0) + 1);
  }

  const members = await Promise.all(
    Array.from(grouped.entries()).map(async ([memberAccountId, roleCount]) => {
      const profile = await getUserProfile(memberAccountId);
      const displayName =
        profile?.nameDisplay ||
        (profile?.nameFirst || profile?.nameLast
          ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
          : null) ||
        memberAccountId;
      return {
        accountId: memberAccountId,
        displayName,
        accountPhoto: profile?.accountPhoto,
        roleCount,
        status: 'active' as const,
      };
    })
  );

  const resolvedAsset = await resolveAssetName(resolvedAssetId, resolved.assetType);
  const backHref = rootMode
    ? `/access/asset?asset=${encodeURIComponent(resolvedAssetId)}&mode=root`
    : `/access/asset?asset=${encodeURIComponent(resolvedAssetId)}`;

  return (
    <MembersLayout
      backHref={backHref}
      description={`Members with access to ${resolved.assetType === 'application' ? 'application' : 'asset'} "${resolvedAsset.name}"`}
      addForm={<AssetMemberLookupForm assetId={resolvedAssetId} rootMode={rootMode} />}
      content={
        members.length > 0 ? (
          <MembersCards
            rows={members.map((member) => ({
              id: `asset:${resolvedAssetId}:${member.accountId}`,
              name: member.displayName,
              description:
                member.roleCount === 0
                  ? 'No roles assigned'
                  : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}`,
              status: member.status,
              actionHref: `/access/role?member_id=${encodeURIComponent(member.accountId)}`,
            }))}
          />
        ) : (
          <EmptyMembers message="No accounts currently have roles on this asset." />
        )
      }
    >
    </MembersLayout>
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default async function MemberPage({ searchParams }: PageProps) {
  const { portfolio: id, asset, mode } = await searchParams;

  if (asset) {
    const activeAccountId = await getActiveAccountId();
    if (!activeAccountId) notFound();
    const rootModeRequested = mode === 'root';
    const isRoot = rootModeRequested ? await isRootUser(activeAccountId) : false;
    return <AssetMembersPage assetRef={asset} rootMode={rootModeRequested && isRoot} />;
  }

  if (id) {
    return <PortfolioAccountPage id={id} />;
  }

  return <DirectAccountPage />;
}
