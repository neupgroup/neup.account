import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FlowLink } from '@/components/ui/flow-link';
import { Card, CardContent } from '@/components/ui/card';
import { FolderGit2, ChevronRight, Building, UserPlus, Users, MailQuestion, UserX } from '@/components/icons';
import { getDirectAccessGroup } from '@/services/manage/access';
import { getAccessAssetGroups, getAccessAssetGroup } from '@/services/manage/access/assets';
import { getActiveAccountId } from '@/core/auth/verify';
import { CreateAssetGroupCard } from './create-asset-group-card';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { AccessGroupView } from './_components/access-group-view';
import { ListItem } from '@/components/ui/list-item';
import { AccountListItem } from '@/components/elements/account-item';
import { permission } from '@/logica/permission';
import { LINKED_ACCOUNT_NAV_PERMISSIONS } from '@/core/auth/linked-account-permissions';
import { getCurrentAccountPermission, getUserProfile } from '@/services/user';
import { getAccessibleAccounts } from '@/services/manage/accounts';
import { getAccountSelectorContext } from '@/core/auth/accountSelector';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import {
  ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS,
  ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS,
  ACCESS_ACCOUNTS_SWITCH_PERMISSIONS,
  ACCESS_APPLICATION_VIEW_PERMISSIONS,
  ACCESS_BLOCK_VIEW_PERMISSIONS,
  ACCESS_CONNECTION_VIEW_PERMISSIONS,
  ACCESS_FAMILY_MEMBER_UPDATE_PERMISSIONS,
  ACCESS_FAMILY_PARTNER_UPDATE_PERMISSIONS,
  ACCESS_INVITATIONS_VIEW_PERMISSIONS,
  ACCESS_PORTFOLIO_CREATE_PERMISSIONS,
  ACCESS_TEAM_VIEW_PERMISSIONS,
  ACCESS_VIEW_PERMISSIONS,
} from '@/core/auth/access-view-permissions';
import { createPageMetadata } from '@/core/metadata';

const pagePermissions = [
  permission('access.view.self', 'for_individual', 'page'),
  permission('access.team.view.self', 'for_individual', 'page'),
  permission('access.connection.view.self', 'for_individual', 'page'),
  permission('access.application.view.self', 'for_individual', 'page'),
  permission('access.linked_account.view.self', 'for_individual', 'page'),
  permission('access.account.brand.create.self', 'for_individual', 'page'),
  permission('access.account.dependent.create.self', 'for_individual', 'page'),
  permission('access.family.member.update.self', 'for_individual', 'page'),
  permission('access.family.partner.update.self', 'for_individual', 'page'),
  permission('access.invitations.view.self', 'for_individual', 'page'),
  permission('access.block.view.self', 'for_individual', 'page'),
  permission('access.accounts.switch.self', 'for_individual', 'page'),
  permission('access.portfolio.create.self', 'for_individual', 'page'),
  permission('linked_accounts.brand.manage', 'for_brand', 'page'),
  permission('linked_accounts.brand.manager', 'for_brand', 'page'),
];

type PageProps = {
  searchParams: Promise<{ portfolio?: string; account?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { portfolio, account } = await searchParams;

  if (portfolio) {
    const group = await getAccessAssetGroup(portfolio);
    return createPageMetadata('Access', group?.name ? `${group.name} Portfolio` : 'Portfolio');
  }

  if (account) {
    const profile = await getUserProfile(account);
    const accountName =
      profile?.nameDisplay ||
      [profile?.nameFirst, profile?.nameLast].filter(Boolean).join(' ').trim() ||
      account;
    return createPageMetadata('Access', `${accountName}'s Account`);
  }

  return createPageMetadata('Access & Control');
}

function LinkAndCreateFeatures({
  canCreateBrand,
  canCreateDependent,
}: {
  canCreateBrand: boolean;
  canCreateDependent: boolean;
}) {
  return (
    <>
      <ListItem
        icon={FolderGit2}
        title="Link Other Accounts"
        description="Connect third-party platforms like WhatsApp."
        href="/access/link"
      />
      {canCreateBrand && (
        <ListItem
          icon={Building}
          title="Create Brand Account"
          description="Set up a new profile for a business or organization."
          href="/access/createAccount?type=brand"
        />
      )}
      {canCreateDependent && (
        <ListItem
          icon={UserPlus}
          title="Create Dependent Account"
          description="Create and manage an account for a family member."
          href="/access/createAccount?type=dependent"
        />
      )}
    </>
  );
}

function PeopleAndSharingFeatures({
  canViewFamily,
  canViewInvitations,
  canBlockUsers,
}: {
  canViewFamily: boolean;
  canViewInvitations: boolean;
  canBlockUsers: boolean;
}) {
  return (
    <>
      {canViewFamily && (
        <ListItem
          icon={Users}
          title="Family Sharing"
          description="Manage your family group and shared subscriptions."
          href="/access/family"
        />
      )}
      {canViewInvitations && (
        <ListItem
          icon={MailQuestion}
          title="Invitations"
          description="Accept or reject requests from other users."
          href="/access/invitations"
        />
      )}
      {canBlockUsers && (
        <ListItem
          icon={UserX}
          title="Blocked Users"
          description="Manage users you have blocked or restricted."
          href="/access/blocked"
        />
      )}
    </>
  );
}

// ── Portfolio detail view ─────────────────────────────────────────────────────

async function PortfolioDetail({ id }: { id: string }) {
  const group = await getAccessAssetGroup(id);
  if (!group) notFound();
  const permissions = await getCurrentAccountPermission();

  return (
    <AccessGroupView
      pageTitle="Access & Control"
      pageDescription="Manage who can access this account and what they can do."
      name={group.name}
      description={group.description ?? 'Portfolio access group.'}
      backHref="/access"
      membersHref={`/access/team?portfolio=${id}`}
      connectionsHref="/access/connection"
      applicationsHref="/access/application"
      showMembers={hasAnyPermission(permissions, ACCESS_TEAM_VIEW_PERMISSIONS)}
      showConnections={hasAnyPermission(permissions, ACCESS_CONNECTION_VIEW_PERMISSIONS)}
      showApplications={hasAnyPermission(permissions, ACCESS_APPLICATION_VIEW_PERMISSIONS)}
    />
  );
}

// ── Root view — direct access + portfolios list ───────────────────────────────

export default async function AccessControlPage({ searchParams }: PageProps) {
  await requireAnyPermission404(ACCESS_VIEW_PERMISSIONS);
  const { portfolio: parentPortfolioId } = await searchParams;

  if (parentPortfolioId) {
    return <PortfolioDetail id={parentPortfolioId} />;
  }

  const accountId = await getActiveAccountId();
  const { isManagingOtherAccount } = await getAccountSelectorContext();

  const [directGroup, portfolios] = await Promise.all([
    accountId ? getDirectAccessGroup(accountId) : null,
    getAccessAssetGroups(),
  ]);

  if (!directGroup) notFound();

  const [permissions, activeProfile] = await Promise.all([
    getCurrentAccountPermission(),
    accountId ? getUserProfile(accountId) : Promise.resolve(null),
  ]);
  const allowsFamilySettings =
    activeProfile?.accountType === 'individual' || activeProfile?.accountType === 'dependent';
  const canViewTeam = hasAnyPermission(permissions, ACCESS_TEAM_VIEW_PERMISSIONS);
  const canViewConnections = hasAnyPermission(permissions, ACCESS_CONNECTION_VIEW_PERMISSIONS);
  const canViewApplications = hasAnyPermission(permissions, ACCESS_APPLICATION_VIEW_PERMISSIONS);
  const showLinkedAccounts = hasAnyPermission(permissions, LINKED_ACCOUNT_NAV_PERMISSIONS);
  const canCreateBrand = hasAnyPermission(permissions, ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS);
  const canCreateDependent = hasAnyPermission(permissions, ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS);
  const canViewFamily =
    allowsFamilySettings &&
    hasAnyPermission(permissions, [...ACCESS_FAMILY_MEMBER_UPDATE_PERMISSIONS, ...ACCESS_FAMILY_PARTNER_UPDATE_PERMISSIONS]);
  const canViewInvitations = hasAnyPermission(permissions, ACCESS_INVITATIONS_VIEW_PERMISSIONS);
  const canBlockUsers = hasAnyPermission(permissions, ACCESS_BLOCK_VIEW_PERMISSIONS);
  const canSwitchAccounts = hasAnyPermission(permissions, ACCESS_ACCOUNTS_SWITCH_PERMISSIONS);
  const canCreatePortfolios = hasAnyPermission(permissions, ACCESS_PORTFOLIO_CREATE_PERMISSIONS);
  const accountsToShow =
    showLinkedAccounts && canSwitchAccounts && !isManagingOtherAccount
      ? await getAccessibleAccounts()
      : [];
  const previewAccounts = accountsToShow.slice(0, 3);

  return (
    <AccessGroupView
      pageTitle="Access & Control"
      pageDescription="Manage who can access this account and what they can do."
      name={directGroup.name}
      description="Direct access grants on this account."
      membersHref="/access/team"
      connectionsHref="/access/connection"
      applicationsHref="/access/application"
      showMembers={canViewTeam}
      showConnections={canViewConnections}
      showApplications={canViewApplications}
    >
      {showLinkedAccounts && (
        <div className="space-y-2">
          <SecondaryHeader
            title="Link & Create Accounts"
            description="Add new brand or dependent accounts to your profile."
          />
          <Card>
            <CardContent className="divide-y p-0">
              <LinkAndCreateFeatures
                canCreateBrand={canCreateBrand}
                canCreateDependent={canCreateDependent}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {showLinkedAccounts && canSwitchAccounts && !isManagingOtherAccount && (
        <div className="space-y-2">
          <SecondaryHeader
            title="Manage Accounts"
            description="Switch to another account you have access to."
          />
          <Card>
            <CardContent className="p-0 divide-y">
              {accountsToShow.length > 0 ? (
                <>
                {previewAccounts.map((account) => (
                  <AccountListItem key={account.aid} account={account} />
                ))}
                <FlowLink
                  href="/access/accounts"
                  className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50"
                >
                  <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-grow">
                    <p className="font-medium text-foreground">See all accounts you can access</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </FlowLink>
                </>
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No other accounts found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {(canViewFamily || canViewInvitations || canBlockUsers) && (
        <div className="space-y-2">
          <SecondaryHeader
            title="People & Sharing"
            description="Manage your requests, family, and blocked users."
          />
          <Card>
            <CardContent className="divide-y p-0">
              <PeopleAndSharingFeatures
                canViewFamily={canViewFamily}
                canViewInvitations={canViewInvitations}
                canBlockUsers={canBlockUsers}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 2 — Portfolios */}
      {(canCreatePortfolios || portfolios.length > 0) && (
        <div className="space-y-2">
          <SecondaryHeader
            title="Portfolios"
            description="Manage asset groups and role-based access."
          />
          <Card>
            <CardContent className="divide-y p-2">
              {canCreatePortfolios && <CreateAssetGroupCard variant="row" />}
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
      )}
    </AccessGroupView>
  );
}
