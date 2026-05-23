import { notFound } from 'next/navigation';
import { FlowLink } from '@/components/ui/flow-link';
import { Card, CardContent } from '@/components/ui/card';
import { FolderGit2, ChevronRight } from '@/components/icons';
import { getDirectAccessGroup } from '@/services/manage/access';
import { getAccessAssetGroups, getAccessAssetGroup } from '@/services/manage/access/assets';
import { getActiveAccountId } from '@/core/auth/verify';
import { CreateAssetGroupCard } from './create-asset-group-card';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { AccessGroupView } from './_components/access-group-view';

type PageProps = {
  searchParams: Promise<{ portfolio?: string }>;
};

// ── Portfolio detail view ─────────────────────────────────────────────────────

async function PortfolioDetail({ id }: { id: string }) {
  const group = await getAccessAssetGroup(id);
  if (!group) notFound();

  return (
    <AccessGroupView
      pageTitle="Access & Control"
      pageDescription="Manage who can access this account and what they can do."
      name={group.name}
      description={group.description ?? 'Portfolio access group.'}
      backHref="/access"
      membersHref={`/access/member?portfolio=${id}`}
      assetsHref={`/access/asset?portfolio=${id}`}
      applicationsHref="/access/appconnection"
      allAssetsHref={`/access/asset?portfolio=${id}`}
    />
  );
}

// ── Root view — direct access + portfolios list ───────────────────────────────

export default async function AccessControlPage({ searchParams }: PageProps) {
  const { portfolio: portfolioId } = await searchParams;

  if (portfolioId) {
    return <PortfolioDetail id={portfolioId} />;
  }

  const accountId = await getActiveAccountId();

  const [directGroup, portfolios] = await Promise.all([
    accountId ? getDirectAccessGroup(accountId) : null,
    getAccessAssetGroups(),
  ]);

  if (!directGroup) notFound();

  return (
    <AccessGroupView
      pageTitle="Access & Control"
      pageDescription="Manage who can access this account and what they can do."
      name={directGroup.name}
      description="Direct access grants on this account."
      membersHref="/access/member"
      assetsHref="/access/asset"
      applicationsHref="/access/appconnection"
      allAssetsHref="/access/asset"
    >
      {/* Section 2 — Portfolios */}
      <div className="space-y-2">
        <SecondaryHeader
          title="Portfolios"
          description="Manage asset groups and role-based access."
        />
        <Card>
          <CardContent className="divide-y p-2">
            <CreateAssetGroupCard variant="row" />
            {portfolios.map((portfolio) => (
              <FlowLink
                key={portfolio.id}
                href={`/access?portfolio=${portfolio.id}`}
                className="flex items-center gap-4 py-4 px-4 hover:bg-muted/50 transition-colors"
              >
                <FolderGit2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-grow min-w-0">
                  <p className="font-medium text-foreground truncate">{portfolio.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {portfolio._count.members} members · {portfolio._count.assets} assets
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </FlowLink>
            ))}
          </CardContent>
        </Card>
      </div>
    </AccessGroupView>
  );
}
