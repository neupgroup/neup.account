import { notFound, redirect } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppWindow, Database, UserCircle, X } from '@/components/icons';
import prisma from '@/core/helpers/prisma';
import { getActiveAccountId } from '@/core/auth/verify';
import { isRootUser } from '@/services/user';
import {
  addAssetToGroupFromForm,
  removeAssetFromGroupFromForm,
} from '@/services/manage/access/actions';
import { getAccessAssetGroup } from '@/services/manage/access/assets';
import { resolveAssetName, resolveAssetNames } from '@/services/manage/access/asset-resolvers';
import { getUserProfile } from '@/services/user';
import { AddAssetForm } from '../_components/add-asset-form';
import { FlowLink } from '@/components/ui/flow-link';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { Prisma } from '../../../../prisma/generated/client/client';

type PageProps = {
  searchParams: Promise<{ asset?: string; mode?: string }>;
};

// ── Asset detail view ─────────────────────────────────────────────────────────

async function getAssetMembers(
  portfolioId: string,
  portfolioAssetId: string,
  accountId: string,
  options?: { rootMode?: boolean },
) {
  if (!options?.rootMode) {
    const member = await prisma.portfolioMember.findFirst({
      where: { portfolioId, accountId },
      select: { id: true },
    });
    if (!member) return null;
  }

  const asset = await prisma.asset.findFirst({
    where: { id: portfolioAssetId, portfolioId },
    select: { id: true, assetId: true, assetType: true },
  });
  if (!asset) return null;

  let grants: Array<{
    id: string;
    account_id: string;
    role_id: string;
    role: { id: string; name: string; description: string | null };
  }> = [];
  try {
    grants = await prisma.authzAssetsAccessGrant.findMany({
      where: {
        asset_id: portfolioAssetId,
        ...(options?.rootMode
          ? { OR: [{ portfolio_id: portfolioId }, { portfolio_id: null }] }
          : { portfolio_id: portfolioId }),
        app_id: 'neup.account',
      },
      select: {
        id: true,
        account_id: true,
        role_id: true,
        role: { select: { id: true, name: true, description: true } },
      },
      orderBy: { account_id: 'asc' },
    });
  } catch (error) {
    // Older databases may not have authz_assets_access_grant yet.
    const e = error as { code?: string };
    if (e?.code !== 'P2021' && e?.code !== 'P2022') throw error;
  }

  const accountMap = new Map<
    string,
    { accountId: string; roles: Array<{ id: string; name: string; description?: string }> }
  >();
  for (const grant of grants) {
    if (!accountMap.has(grant.account_id)) {
      accountMap.set(grant.account_id, { accountId: grant.account_id, roles: [] });
    }
    accountMap.get(grant.account_id)!.roles.push({
      id: grant.role.id,
      name: grant.role.name,
      description: grant.role.description ?? undefined,
    });
  }

  return { asset, members: Array.from(accountMap.values()) };
}

async function AssetDetail({
  portfolioId,
  assetId,
  rootMode,
  inviteCard,
}: {
  portfolioId: string;
  assetId: string;
  rootMode?: boolean;
  inviteCard?: { href: string; title: string; description: string } | null;
}) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const data = await getAssetMembers(portfolioId, assetId, accountId, { rootMode });
  if (!data) notFound();

  const { asset, members } = data;
  const resolved = await resolveAssetName(asset.assetId, asset.assetType);

  const memberProfiles = await Promise.all(
    members.map(async (m) => {
      const profile = await getUserProfile(m.accountId);
      const name =
        profile?.nameDisplay ||
        (profile?.nameFirst || profile?.nameLast
          ? `${profile.nameFirst ?? ''} ${profile.nameLast ?? ''}`.trim()
          : null) ||
        m.accountId;
      return { ...m, displayName: name };
    })
  );

  return (
    <div className="grid gap-8">
      <BackButton href={`/access/asset?portfolio=${portfolioId}`} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
            <Database className="h-5 w-5 text-muted-foreground" />
          </div>
          <PrimaryHeader
            title={resolved.name}
            description={resolved.subtitle ?? asset.assetType}
          />
        </div>
        <Badge variant="outline" className="shrink-0">{asset.assetType}</Badge>
      </div>

      {/* Members with access */}
      <div className="space-y-2">
        <SecondaryHeader
          title="Members with access"
          description={`${memberProfiles.length} member${memberProfiles.length !== 1 ? 's' : ''} assigned roles on this asset.`}
        />

        <Card>
          <CardContent className="divide-y p-2">
            {inviteCard && (
              <FlowLink
                href={inviteCard.href}
                className="flex items-center gap-4 py-4 px-4 hover:bg-muted/50 transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-grow">
                  <p className="font-medium">{inviteCard.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {inviteCard.description}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground shrink-0">→</span>
              </FlowLink>
            )}

            {memberProfiles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <UserCircle className="h-6 w-6 text-muted-foreground" />
                </span>
                <p className="font-medium">No members yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  No members have been assigned roles for this asset yet.
                </p>
              </div>
            ) : (
              memberProfiles.map((member) => (
                <div key={member.accountId} className="flex items-center gap-4 py-4 px-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-grow">
                    <p className="font-medium truncate">{member.displayName}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <Badge
                          key={role.id}
                          variant="secondary"
                          className="text-xs px-1.5 py-0"
                          title={role.description}
                        >
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Asset list view ───────────────────────────────────────────────────────────

async function AssetList({ portfolioId, mode }: { portfolioId: string; mode?: string }) {
  const group = await getAccessAssetGroup(portfolioId);
  if (!group) notFound();

  const assetNameMap = await resolveAssetNames(group.assets);
  const existingAssetIds = group.assets.map((a) => a.assetId);

  const addAssetAction = addAssetToGroupFromForm.bind(null, portfolioId);
  const removeAssetAction = removeAssetFromGroupFromForm.bind(null, portfolioId);

  return (
    <div className="grid gap-8">
      <BackButton href={`/access?portfolio=${portfolioId}`} />

      {/* Header */}
      <PrimaryHeader
        title="Assets"
        description={`Manage the assets available in portfolio "${group.name}".`}
      />

      {/* Add asset */}
      <div className="space-y-2">
        <SecondaryHeader
          title="Add Asset"
          description="Add a brand account, branch account, or application to this portfolio."
        />
        <Card>
          <CardContent className="p-0">
            <AddAssetForm action={addAssetAction} existingAssetIds={existingAssetIds} mode={mode} />
          </CardContent>
        </Card>
      </div>

      {/* Application shortcut */}
      {group.assets.some((a) => ['application', 'app'].includes(a.assetType.toLowerCase())) && (
        <FlowLink
          href={`/access/appconnection?portfolio=${portfolioId}`}
          className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <AppWindow className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">Application Connection</p>
              <p className="text-sm text-muted-foreground">
                See members and roles per application
              </p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground shrink-0">→</span>
        </FlowLink>
      )}

      {/* Asset list */}
      <div className="space-y-2">
        <SecondaryHeader
          title="Assets"
          description={group.assets.length > 0 ? `${group.assets.length} asset${group.assets.length !== 1 ? 's' : ''} in this portfolio.` : 'No assets added yet.'}
        />
        <Card>
          <CardContent className="divide-y p-2">
            {group.assets.length > 0 ? (
              group.assets.map((asset) => {
                const resolved = assetNameMap[asset.id];
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-4 py-4 px-4 hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Database className="h-4 w-4 text-muted-foreground" />
                    </span>

                    <FlowLink
                      href={`/access/asset?portfolio=${portfolioId}&asset=${asset.id}`}
                      className="min-w-0 flex-grow"
                    >
                      <p className="font-medium truncate text-foreground">
                        {resolved?.name ?? asset.assetId}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {resolved?.subtitle ?? asset.assetType}
                      </p>
                    </FlowLink>

                    <Badge variant="outline" className="shrink-0 text-xs">
                      {asset.assetType}
                    </Badge>

                    <form action={removeAssetAction}>
                      <input type="hidden" name="portfolioAssetId" value={asset.id} />
                      {mode === 'root' && <input type="hidden" name="mode" value="root" />}
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${resolved?.name ?? asset.assetId} from portfolio`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Database className="h-6 w-6 text-muted-foreground" />
                </span>
                <p className="font-medium">No assets yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Add a brand account, branch account, or application using the picker above.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Application access view ───────────────────────────────────────────────────

async function AssetAccessView({ assetRef: rawAssetRef, rootMode }: { assetRef: string; rootMode?: boolean }) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  // `asset` can be either portfolio-asset row id or logical assetId (app/account id).
  const byRowId = await prisma.asset.findUnique({
    where: { id: rawAssetRef },
    select: { id: true, assetId: true, assetType: true, portfolioId: true },
  });

  let resolved = byRowId;
  if (!resolved) {
    resolved = await prisma.asset.findFirst({
      where: { assetId: rawAssetRef },
      select: { id: true, assetId: true, assetType: true, portfolioId: true },
      orderBy: { id: 'asc' },
    });
  }

  if (!resolved && rootMode) {
    // Root direct-mode bootstrap: if rawAssetRef is a known application id,
    // register it as an asset in the actor's personal portfolio.
    const app = await prisma.application.findUnique({
      where: { id: rawAssetRef },
      select: { id: true },
    });
    if (app) {
      const personalMembership = await prisma.portfolioMember.findFirst({
        where: { accountId },
        select: { portfolioId: true },
        orderBy: { id: 'asc' },
      });
      if (personalMembership?.portfolioId) {
        resolved = await prisma.asset.create({
          data: {
            portfolioId: personalMembership.portfolioId,
            assetId: rawAssetRef,
            assetType: 'application',
          },
          select: { id: true, assetId: true, assetType: true, portfolioId: true },
        });
      }
    }
  }

  if (!resolved) {
    return (
      <div className="grid gap-8">
        <BackButton href="/access" />
        <PrimaryHeader
          title="Access"
          description="This asset is not registered yet."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Database className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-medium">No accounts have access to this asset</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Register this asset first before assigning access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pull all rows for this logical asset to detect whether it's shared via a portfolio.
  const allRows = await prisma.asset.findMany({
    where: { assetId: resolved.assetId, assetType: resolved.assetType },
    select: { id: true, portfolioId: true },
  });
  const rowIds = allRows.map((r) => r.id);
  const portfolioIds = Array.from(new Set(allRows.map((r) => r.portfolioId)));

  if (!rootMode) {
    // Non-root users must be an active member in at least one related portfolio.
    const canView = await prisma.portfolioMember.findFirst({
      where: {
        accountId,
        portfolioId: { in: portfolioIds },
      },
      select: { id: true },
    });
    if (!canView) notFound();
  }

  const sharedViaPortfolio = await prisma.portfolioMember.findFirst({
    where: {
      portfolioId: { in: portfolioIds },
      accountId: { not: accountId },
    },
    select: { portfolioId: true },
  });

  const modeSuffix = rootMode ? '&mode=root' : '';
  const humanType = resolved.assetType === 'application' ? 'application' : 'asset';
  const inviteCard = rootMode
    ? sharedViaPortfolio
      ? {
          href: `/access/member?portfolio=${sharedViaPortfolio.portfolioId}&asset=${encodeURIComponent(resolved.assetId)}${modeSuffix}`,
          title: `Manage access for this ${humanType}`,
          description: `This ${humanType} is added in a portfolio. You can't assign anyone outside that portfolio.`,
        }
      : {
          href: `/access/member?asset=${encodeURIComponent(resolved.assetId)}${modeSuffix}`,
          title: `Add someone to access this ${humanType}`,
          description: `This ${humanType} is not added to a shared portfolio. You can assign access directly.`,
        }
    : null;

  return (
    <AssetDetail
      portfolioId={resolved.portfolioId}
      assetId={resolved.id}
      rootMode={rootMode}
      inviteCard={inviteCard}
    />
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default async function AssetPage({ searchParams }: PageProps) {
  const { asset: assetId, mode } = await searchParams;

  if (mode === 'root') {
    const accountId = await getActiveAccountId();
    const isRoot = accountId ? await isRootUser(accountId) : false;
    if (!isRoot) {
      const next = new URLSearchParams();
      if (assetId) next.set('asset', assetId);
      const qs = next.toString();
      redirect(qs ? `/access/asset?${qs}` : '/access/asset');
    }
  }

  const rootMode = mode === 'root';

  if (!assetId) {
    return (
      <div className="grid gap-8">
        <BackButton href="/access" />
        <PrimaryHeader
          title="Assets"
          description="Open an asset-specific access view with ?asset=<assetId>."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Database className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-medium">No accounts have access to this asset</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              No asset access entries are available here. Create a portfolio and assign roles to grant access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AssetAccessView assetRef={assetId} rootMode={rootMode} />;
}
