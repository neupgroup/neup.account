import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PageProps = {
  searchParams: Promise<{ portfolio?: string; asset?: string; mode?: string }>;
};

type MemberStatus = 'active' | 'invited' | 'on_hold' | 'expired';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: MemberStatus }) {
  if (status === 'active') return null;

  const config: Record<string, { label: string; variant: 'outline'; className: string }> = {
    invited:  { label: 'Invited',  variant: 'outline', className: 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400' },
    on_hold:  { label: 'On Hold',  variant: 'outline', className: 'text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400' },
    expired:  { label: 'Expired',  variant: 'outline', className: 'text-muted-foreground border-border' },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <Badge variant={c.variant} className={`text-xs shrink-0 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

type MembersTableRow = {
  id: string;
  member_id: string;
  role: string;
  status: MemberStatus;
  targetType: 'portfolio' | 'account';
  targetId: string;
  actionHref: string;
};

function MembersTable({ rows }: { rows: MembersTableRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>id</TableHead>
          <TableHead>member_id</TableHead>
          <TableHead>role</TableHead>
          <TableHead>status</TableHead>
          <TableHead>targetType</TableHead>
          <TableHead>targetId</TableHead>
          <TableHead className="text-right">action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.targetType}:${row.targetId}:${row.member_id}`}>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell className="font-mono text-xs">{row.member_id}</TableCell>
            <TableCell>{row.role}</TableCell>
            <TableCell>
              {row.status === 'active' ? (
                <span className="text-sm">active</span>
              ) : (
                <StatusBadge status={row.status} />
              )}
            </TableCell>
            <TableCell>{row.targetType}</TableCell>
            <TableCell className="font-mono text-xs">{row.targetId}</TableCell>
            <TableCell className="text-right">
              <FlowLink href={row.actionHref} className="inline-flex items-center gap-1 text-sm font-medium">
                Open
                <ChevronRight className="h-4 w-4" />
              </FlowLink>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Shared page layout ────────────────────────────────────────────────────────

function MembersLayout({
  backHref,
  description,
  addForm,
  table,
}: {
  backHref: string;
  description: string;
  addForm: React.ReactNode;
  table: React.ReactNode;
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
          <CardContent className="p-2">{table}</CardContent>
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
      addForm={<AddMemberForm portfolioId={id} />}
      table={
        members.length > 0 ? (
          <MembersTable
            rows={members.map((member) => ({
              id: `portfolio:${id}:${member.accountId}`,
              member_id: member.accountId,
              role: member.roleCount === 0 ? 'No roles assigned' : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}`,
              status: member.status,
              targetType: 'portfolio',
              targetId: id,
              actionHref: `/access/role?portfolio=${id}&member=${member.accountId}`,
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
      table={
        members.length > 0 ? (
          <MembersTable
            rows={members.map((member) => ({
              id: `account:${accountId}:${member.accountId}`,
              member_id: member.accountId,
              role: member.roleCount === 0 ? 'No roles assigned' : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}`,
              status: member.status,
              targetType: 'account',
              targetId: accountId,
              actionHref: `/access/role?member=${member.accountId}`,
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

  const resolved = await prisma.asset.findFirst({
    where: {
      OR: [{ id: assetRef }, { assetId: assetRef }],
    },
    select: {
      assetId: true,
      assetType: true,
    },
  });

  if (!resolved) notFound();

  const allRows = await prisma.asset.findMany({
    where: {
      assetId: resolved.assetId,
      assetType: resolved.assetType,
    },
    select: { id: true, portfolioId: true },
  });

  if (allRows.length === 0) notFound();

  const rowIds = allRows.map((r) => r.id);
  const portfolioIds = Array.from(new Set(allRows.map((r) => r.portfolioId)));

  if (!rootMode) {
    const canView = await prisma.portfolioMember.findFirst({
      where: {
        accountId,
        portfolioId: { in: portfolioIds },
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

  const resolvedAsset = await resolveAssetName(resolved.assetId, resolved.assetType);
  const backHref = rootMode
    ? `/access/asset?asset=${encodeURIComponent(resolved.assetId)}&mode=root`
    : `/access/asset?asset=${encodeURIComponent(resolved.assetId)}`;

  return (
    <MembersLayout
      backHref={backHref}
      description={`Members with access to ${resolved.assetType === 'application' ? 'application' : 'asset'} "${resolvedAsset.name}"`}
      addForm={<AssetMemberLookupForm assetId={resolved.assetId} rootMode={rootMode} />}
      table={
        members.length > 0 ? (
          <MembersTable
            rows={members.map((member) => ({
              id: `asset:${resolved.assetId}:${member.accountId}`,
              member_id: member.accountId,
              role: member.roleCount === 0 ? 'No roles assigned' : `${member.roleCount} role${member.roleCount !== 1 ? 's' : ''}`,
              status: member.status,
              targetType: 'account',
              targetId: accountId,
              actionHref: `/access/role?member=${encodeURIComponent(member.accountId)}`,
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
