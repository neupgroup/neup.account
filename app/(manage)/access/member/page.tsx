import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ChevronRight, Clock } from '@/components/icons';
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'active' | 'invited' | 'on_hold' | 'expired' }) {
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

// ── Shared member row ─────────────────────────────────────────────────────────

function MemberRow({
  href,
  displayName,
  accountPhoto,
  roleCount,
  status,
}: {
  href: string;
  displayName: string;
  accountPhoto?: string;
  roleCount: number;
  status: 'active' | 'invited' | 'on_hold' | 'expired';
}) {
  const isInvited = status === 'invited';
  const isExpired = status === 'expired';
  const isPending = isInvited || isExpired;

  return (
    <FlowLink
      href={href}
      className="flex items-center gap-4 py-4 px-4 hover:bg-muted/50 transition-colors"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden ${isInvited ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-muted'}`}>
        {accountPhoto && !isPending ? (
          <Image
            src={accountPhoto}
            alt={displayName}
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        ) : isInvited ? (
          <Clock className="h-4 w-4 text-amber-500" />
        ) : isExpired ? (
          <Clock className="h-4 w-4 text-muted-foreground" />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-grow">
        <p className={`font-medium truncate ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
          {displayName}
        </p>
        <p className="text-sm text-muted-foreground">
          {isInvited
            ? 'Invitation pending'
            : isExpired
            ? 'Invitation expired'
            : roleCount === 0
            ? 'No roles assigned'
            : `${roleCount} role${roleCount !== 1 ? 's' : ''} assigned`}
        </p>
      </div>
      <StatusBadge status={status} />
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </FlowLink>
  );
}

// ── Shared page layout ────────────────────────────────────────────────────────

function MembersLayout({
  backHref,
  description,
  addForm,
  children,
}: {
  backHref: string;
  description: string;
  addForm: React.ReactNode;
  children: React.ReactNode;
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
          <CardContent className="divide-y p-2">
            {children}
          </CardContent>
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
    >
      {members.length > 0 ? (
        members.map((member) => (
          <MemberRow
            key={member.accountId}
            href={`/access/role?portfolio=${id}&member=${member.accountId}`}
            displayName={member.displayName}
            accountPhoto={member.accountPhoto}
            roleCount={member.roleCount}
            status={member.status}
          />
        ))
      ) : (
        <EmptyMembers message="Add a member above using their NeupID." />
      )}
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
    >
      {members.length > 0 ? (
        members.map((member) => (
          <MemberRow
            key={member.accountId}
            href={`/access/role?member=${member.accountId}`}
            displayName={member.displayName}
            accountPhoto={member.accountPhoto}
            roleCount={member.roleCount}
            status={member.status}
          />
        ))
      ) : (
        <EmptyMembers message="Use the form above to invite someone by NeupID." />
      )}
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
    >
      {members.length > 0 ? (
        members.map((member) => (
          <MemberRow
            key={member.accountId}
            href={`/access/role?member=${encodeURIComponent(member.accountId)}`}
            displayName={member.displayName}
            accountPhoto={member.accountPhoto}
            roleCount={member.roleCount}
            status={member.status}
          />
        ))
      ) : (
        <EmptyMembers message="No accounts currently have roles on this asset." />
      )}
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
