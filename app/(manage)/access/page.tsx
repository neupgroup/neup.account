import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FlowLink } from '@/components/ui/flow-link';
import { Card, CardContent } from '@/components/ui/card';
import { FolderGit2, ChevronRight, Building, UserPlus, Users, MailQuestion, UserX } from '@/components/icons';
import { getDirectAccessGroup } from '@/services/manage/access';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { AccessGroupView } from './_components/access-group-view';
import { ListItem } from '@/components/ui/list-item';
import { AccountListItem } from '@/components/elements/account-item';
import { permission } from '@/neup.logica/permission';
import { LINKED_ACCOUNT_NAV_PERMISSIONS } from '@/core/auth/linked-account-permissions';
import { getUserProfile } from '@/services/user';
import { getAccessibleAccounts } from '@/services/manage/accounts';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';
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
  permission('linked_accounts.brand.manage', 'for_brand', 'page'),
  permission('linked_accounts.brand.manager', 'for_brand', 'page'),
];

type PageProps = {
  searchParams: Promise<{ portfolio?: string; selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { portfolio, selectedProfile } = await searchParams;

  if (portfolio) {
    return createPageMetadata('Access', 'Not Found');
  }

  if (selectedProfile) {
    const profile = await getUserProfile(selectedProfile);
    const accountName =
      profile?.nameDisplay ||
      [profile?.nameFirst, profile?.nameLast].filter(Boolean).join(' ').trim() ||
      selectedProfile;
    return createPageMetadata('Access', `${accountName}'s Account`);
  }

  return createPageMetadata('Access & Control');
}

function LinkAndCreateFeatures({
  canCreateBrand,
  canCreateDependent,
  linkHref,
  brandHref,
  dependentHref,
}: {
  canCreateBrand: boolean;
  canCreateDependent: boolean;
  linkHref: string;
  brandHref: string;
  dependentHref: string;
}) {
  return (
    <>
      <ListItem
        icon={FolderGit2}
        title="Link Other Accounts"
        description="Connect third-party platforms like WhatsApp."
        href={linkHref}
      />
      {canCreateBrand && (
        <ListItem
          icon={Building}
          title="Create Brand Account"
          description="Set up a new profile for a business or organization."
          href={brandHref}
        />
      )}
      {canCreateDependent && (
        <ListItem
          icon={UserPlus}
          title="Create Dependent Account"
          description="Create and manage an account for a family member."
          href={dependentHref}
        />
      )}
    </>
  );
}

function PeopleAndSharingFeatures({
  canViewFamily,
  canViewInvitations,
  canBlockUsers,
  familyHref,
  invitationsHref,
  blockedHref,
}: {
  canViewFamily: boolean;
  canViewInvitations: boolean;
  canBlockUsers: boolean;
  familyHref: string;
  invitationsHref: string;
  blockedHref: string;
}) {
  return (
    <>
      {canViewFamily && (
        <ListItem
          icon={Users}
          title="Family Sharing"
          description="Manage your family group and shared subscriptions."
          href={familyHref}
        />
      )}
      {canViewInvitations && (
        <ListItem
          icon={MailQuestion}
          title="Invitations"
          description="Accept or reject requests from other users."
          href={invitationsHref}
        />
      )}
      {canBlockUsers && (
        <ListItem
          icon={UserX}
          title="Blocked Users"
          description="Manage users you have blocked or restricted."
          href={blockedHref}
        />
      )}
    </>
  );
}

function buildAccessHref(
  pathname: string,
  context: {
    selectedProfile?: string;
    mode?: string;
    workingProfile?: string;
  },
) {
  const [basePathname, query = ''] = pathname.split('?', 2);
  const existingParams = new URLSearchParams(query);
  const params = new URLSearchParams();

  existingParams.forEach((value, key) => {
    params.append(key, value);
  });
  if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
  if (context.mode) params.set('mode', context.mode);
  if (context.workingProfile) params.set('workingProfile', context.workingProfile);

  const nextQuery = params.toString();
  return nextQuery ? `${basePathname}?${nextQuery}` : basePathname;
}

export default async function AccessControlPage({ searchParams }: PageProps) {
  const {
    portfolio: parentPortfolioId,
    selectedProfile,
    mode,
    workingProfile,
  } = await searchParams;

  if (parentPortfolioId) {
    notFound();
  }

  const accessContext = await resolveAccessProfileContext({
    selectedProfile,
    workingProfile,
    requiredPermissions: ACCESS_VIEW_PERMISSIONS,
  });

  if (!accessContext) notFound();

  const selectedAccountId = accessContext.selectedProfile;
  const directGroup = await getDirectAccessGroup(selectedAccountId, { skipPermissionCheck: true });
  if (!directGroup) notFound();

  const [activeProfile] = await Promise.all([
    getUserProfile(selectedAccountId),
  ]);
  const permissions = accessContext.permissions;
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
  const accountsToShow =
    showLinkedAccounts && canSwitchAccounts && accessContext.isSelf && accessContext.isWorkingAsSignedIn
      ? await getAccessibleAccounts()
      : [];
  const previewAccounts = accountsToShow.slice(0, 3);
  const childHrefContext = {
    selectedProfile: selectedAccountId,
    mode,
    workingProfile,
  };

  return (
    <AccessGroupView
      pageTitle="Access & Control"
      pageDescription="Manage who can access this account and what they can do."
      name={directGroup.name}
      description="Direct access grants on this account."
      membersHref={buildAccessHref('/access/team', childHrefContext)}
      connectionsHref={buildAccessHref('/access/connection', childHrefContext)}
      applicationsHref={buildAccessHref('/access/application', childHrefContext)}
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
                linkHref={buildAccessHref('/access/link', childHrefContext)}
                brandHref={buildAccessHref('/access/createAccount?type=brand', childHrefContext)}
                dependentHref={buildAccessHref('/access/createAccount?type=dependent', childHrefContext)}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {showLinkedAccounts && canSwitchAccounts && accessContext.isSelf && accessContext.isWorkingAsSignedIn && (
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
                familyHref={buildAccessHref('/access/family', childHrefContext)}
                invitationsHref={buildAccessHref('/access/invitations', childHrefContext)}
                blockedHref={buildAccessHref('/access/blocked', childHrefContext)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </AccessGroupView>
  );
}
