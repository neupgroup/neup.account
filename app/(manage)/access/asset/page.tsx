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
  searchParams: Promise<{ portfolio?: string; asset?: string; application?: string; mode?: string }>;
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

  const grants = await prisma.authzAssetsAccessGrant.findMany({
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
  showRootInviteCard,
}: {
  portfolioId: string;
  assetId: string;
  rootMode?: boolean;
  showRootInviteCard?: boolean;
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
            {showRootInviteCard && (
              <FlowLink
                href={`/access/member?portfolio=${portfolioId}&mode=root`}
                className="flex items-center gap-4 py-4 px-4 hover:bg-muted/50 transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-grow">
                  <p className="font-medium">Invite someone to this asset</p>
                  <p className="text-sm text-muted-foreground">
                    Add a member and assign roles for this application asset.
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

async function ApplicationAssetView({ applicationId, rootMode }: { applicationId: string; rootMode?: boolean }) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  // Find a portfolioAsset row where assetId = applicationId and the current
  // user is a member of that portfolio.
  // Some environments may not yet have portfolio_member.status (schema drift),
  // so we retry without status on P2022.
  let portfolioAsset: { id: string; portfolioId: string } | null = null;
  try {
    portfolioAsset = await prisma.asset.findFirst({
      where: {
        assetId: applicationId,
        assetType: { in: ['application', 'app'] },
        ...(rootMode ? {} : {
          portfolio: {
            members: { some: { accountId, status: 'active' } },
          },
        }),
      },
      select: { id: true, portfolioId: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2022'
    ) {
      portfolioAsset = await prisma.asset.findFirst({
        where: {
          assetId: applicationId,
          assetType: { in: ['application', 'app'] },
          ...(rootMode ? {} : {
            portfolio: {
              members: { some: { accountId } },
            },
          }),
        },
        select: { id: true, portfolioId: true },
      });
    } else {
      throw error;
    }
  }

  if (!portfolioAsset) {
    if (rootMode) {
      // Root direct mode: create a backing asset row so direct grants can exist
      // with portfolio_id = null while still referencing a valid asset_id.
      const personalMembership = await prisma.portfolioMember.findFirst({
        where: { accountId },
        select: { portfolioId: true },
        orderBy: { id: 'asc' },
      });

      if (personalMembership?.portfolioId) {
        const created = await prisma.asset.create({
          data: {
            portfolioId: personalMembership.portfolioId,
            assetId: applicationId,
            assetType: 'application',
          },
          select: { id: true, portfolioId: true },
        });
        portfolioAsset = created;
      }
    }
  }

  if (!portfolioAsset) {
    // Application is not in any portfolio the user can access — show a helpful message
    return (
      <div className="grid gap-8">
        <BackButton href={`/application/${applicationId}`} />
        <PrimaryHeader
          title="Access"
          description="This application has not been added to any portfolio you have access to."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Database className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-medium">No accounts have access to this application</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              No access grants were found for this application in the portfolios you can view.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AssetDetail
      portfolioId={portfolioAsset.portfolioId}
      assetId={portfolioAsset.id}
      rootMode={rootMode}
      showRootInviteCard={rootMode}
    />
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default async function AssetPage({ searchParams }: PageProps) {
  const { portfolio: portfolioId, asset: assetId, application: applicationId, mode } = await searchParams;

  if (mode === 'root') {
    const accountId = await getActiveAccountId();
    const isRoot = accountId ? await isRootUser(accountId) : false;
    if (!isRoot) {
      const next = new URLSearchParams();
      if (portfolioId) next.set('portfolio', portfolioId);
      if (assetId) next.set('asset', assetId);
      if (applicationId) next.set('application', applicationId);
      const qs = next.toString();
      redirect(qs ? `/access/asset?${qs}` : '/access/asset');
    }
  }

  const rootMode = mode === 'root';

  if (applicationId) {
    return <ApplicationAssetView applicationId={applicationId} rootMode={rootMode} />;
  }

  if (!portfolioId) {
    // Direct access context — no portfolio assets
    return (
      <div className="grid gap-8">
        <BackButton href="/access" />
        <PrimaryHeader
          title="Assets"
          description="Assets are managed through portfolios."
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

  if (assetId) {
    return <AssetDetail portfolioId={portfolioId} assetId={assetId} rootMode={rootMode} />;
  }

  return <AssetList portfolioId={portfolioId} mode={mode} />;
}
