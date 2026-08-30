import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '#/components/ui/back-button';
import { Card, CardContent } from '#/components/ui/card';
import { PrimaryHeader } from '#/components/ui/primary-header';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { FlowLink } from '#/components/ui/flow-link';
import { Clock, UserCircle } from '@/components/icons';
import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile } from '@/services/user';
import prisma from '@/.neup/core/database/prisma';
import { getAccessAssetGroup } from '@/services/manage/access/assets';
import { bulkAssignPermissionsFromForm } from '@/services/manage/access/actions';
import { AssignPermissionsWizard } from '../_components/assign-permissions-wizard';
import { getConnectionDetail } from '../connection/actions';
import { AssignAppAccessForm } from '../connection/assign-app-access-form';
import {
  getDirectMemberDetail,
  getPortfolioMemberDetail,
  getMyPortfolioRoles,
} from '@/services/manage/access';
import { RemoveMemberButton } from '../_components/remove-member-button';
import { InviteButton } from '../_components/invite-button';
import {
  cancelDirectInvitation,
  cancelPortfolioInvitation,
  getDirectAccessAssignmentOptions,
  inviteDirectMember,
  inviteToPortfolio,
  removeDirectMember,
  removePortfolioMember,
} from '../_components/actions';
import { DirectMemberAccessForm } from '../_components/direct-member-access-form';
import { AddUserForm } from '../add-user-form';
import { resolveAccessProfileContext } from '@/services/account/access-profile-context';
import { ACCESS_TEAM_ADD_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';

type PageProps = {
  searchParams: Promise<{
    portfolio?: string;
    connection?: string;
    account?: string;
    member?: string;
    mode?: string;
    workingProfile?: string;
    selectedProfile?: string;
    selectedAccount?: string;
  }>;
};

const NEUPID_LOGO = 'https://neupgroup.com/assets/branding/neup.group/logo.svg';
const FALLBACK_PHOTO = 'https://neupgroup.com/assets/user.png';
const DIRECT_CUSTOM_ROLE_PREFIX = 'account.access.';

async function hasPendingDirectInvitation(
  senderAccountId: string,
  recipientAccountId: string,
): Promise<boolean> {
  const reqs = await prisma.request.findMany({
    where: {
      action: 'access_invitation',
      senderId: senderAccountId,
      recipientId: recipientAccountId,
      status: 'pending',
    },
    select: { data: true },
  });
  return reqs.some(
    (r) => !(r.data as Record<string, unknown> | null)?.parentPortfolioId,
  );
}

async function getPortfolioName(parentPortfolioId: string): Promise<string | null> {
  void parentPortfolioId;
  return null;
}

type PortfolioMemberFlags = {
  hasFullAccess: boolean;
  isPermanent: boolean;
};

async function getPortfolioMemberFlags(
  parentPortfolioId: string,
  memberAccountId: string,
): Promise<PortfolioMemberFlags | null> {
  void parentPortfolioId;
  void memberAccountId;
  return null;
}

async function hasOtherPermanentOwner(
  parentPortfolioId: string,
  excludeAccountId: string,
): Promise<boolean> {
  void parentPortfolioId;
  void excludeAccountId;
  return false;
}

function PlatformAvatar({
  userPhoto,
  platformLogo,
  platformName,
}: {
  userPhoto: string;
  platformLogo: string;
  platformName: string;
}) {
  return (
    <div className="relative shrink-0 h-14 w-14">
      <span className="flex h-14 w-14 rounded-full overflow-hidden bg-muted">
        <Image src={userPhoto} alt="User photo" width={56} height={56} className="h-full w-full object-cover" />
      </span>
      <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background overflow-hidden">
        <Image src={platformLogo} alt={platformName} width={20} height={20} className="h-full w-full object-contain" />
      </span>
    </div>
  );
}

function PageHeader({
  photo,
  displayName,
  description,
}: {
  photo: string;
  displayName: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="shrink-0 rounded-lg overflow-hidden bg-muted border">
        <Image src={photo} alt={displayName} width={72} height={72} className="h-18 w-18 object-cover" />
      </span>
      <div>
        <p className="text-lg font-semibold">{displayName}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function RoleCard({
  platformLabel,
  contextName,
  roleName,
  roleDescription,
  avatar,
}: {
  platformLabel: string;
  contextName?: string;
  roleName: string;
  roleDescription?: string;
  avatar?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      {avatar}
      <div className="grid gap-1 min-w-0">
        {avatar ? (
          contextName && <p className="text-base font-semibold">{contextName}</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold capitalize">{platformLabel}</span>
            {contextName && (
              <Badge type="tinted" className="text-xs font-normal">{contextName}</Badge>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{roleName}</span>
          {roleDescription && (
            <>
              <span className="mx-1.5 text-muted-foreground/60">&middot;</span>
              {roleDescription}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function InvitedBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>
    </div>
  );
}

function EmptyRoles({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="font-medium">No roles assigned</p>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </CardContent>
    </Card>
  );
}

/**
 * ::neup.documentation::assign-page
 * ::title Access Assign Page
 *
 * Hosts assignment flows for portfolio asset roles and connection-level app access.
 *
 * ::public
 *
 * The page supports `portfolio`, `connection`, `account`, `selectedProfile`, `selectedAccount`, and `workingProfile` query combinations for portfolio-member, connection-member, and direct-account assignment flows. Query parameter names are normalized to asset-style names such as `account`, not `member_id`; `selectedProfile` identifies the account whose access is being edited, with `selectedAccount` accepted as a legacy alias.
 *
 * ::public end
 *
 * ::private
 *
 * Query-param branching keeps assignment flows behind one stable route while each branch reuses its existing service and form layer. Direct-account assignment keeps `account` as the member target and `selectedProfile` as the owner profile context, and requires add permission before opening the assignment interface.
 *
 * ::private end
 *
 * ::end
 */
export default async function AssignPermissionsPage({ searchParams }: PageProps) {
  const {
    portfolio,
    connection: connectionId,
    account,
    member,
    mode,
    workingProfile,
    selectedProfile,
    selectedAccount,
  } = await searchParams;
  const accountId = account || member;
  const selectedProfileParam = selectedProfile ?? selectedAccount;
  const accessContext = { selectedProfile: selectedProfileParam, mode, workingProfile };
  const directOwnerContext = selectedProfileParam ?? workingProfile;

  const appendAccessContext = (href: string) => {
    const [pathname, query = ''] = href.split('?', 2);
    const params = new URLSearchParams(query);
    if (accessContext.selectedProfile) params.set('selectedProfile', accessContext.selectedProfile);
    if (accessContext.mode) params.set('mode', accessContext.mode);
    if (accessContext.workingProfile) params.set('workingProfile', accessContext.workingProfile);
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  if (connectionId) {
    const connection = await getConnectionDetail(connectionId, directOwnerContext);
    if (!connection || !connection.canGrantDirectAccess) notFound();
    const selectedMember = accountId
      ? connection.members.find((item) => item.accountId === accountId) ?? null
      : null;

    if (accountId && !selectedMember) notFound();

    return (
      <div className="grid gap-8">
        <BackButton href={appendAccessContext(`/access/connection/${connection.id}`)} />
        <PrimaryHeader
          title={selectedMember ? 'Edit Connection Access' : 'Add People to This Connection'}
          description={
            selectedMember
              ? `Update direct ${connection.appName} access for ${selectedMember.displayName}.`
              : `Grant direct access to ${connection.appName} for accounts that already have an active connection.`
          }
        />
        <Card>
          <CardContent className="p-0">
            <AssignAppAccessForm
              appId={connection.appId}
              connectionId={connection.id}
              appName={connection.appName}
              availableRoles={connection.availableRoles}
              initialAccount={
                selectedMember
                  ? {
                      accountId: selectedMember.accountId,
                      displayName: selectedMember.displayName,
                      teamMembershipStatus: 'active',
                    }
                  : null
              }
              initialRoleIds={selectedMember?.roles.map((role) => role.roleId) ?? []}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (portfolio && accountId) {
    const activeAccountId = await getActiveAccountId(workingProfile);
    if (!activeAccountId) notFound();

    const [detail, memberProfile, callerFlags, portfolioName] = await Promise.all([
      getPortfolioMemberDetail(portfolio, accountId),
      getUserProfile(accountId),
      getPortfolioMemberFlags(portfolio, activeAccountId),
      getPortfolioName(portfolio),
    ]);

    if (!memberProfile || !portfolioName) notFound();

    const displayName =
      memberProfile.nameDisplay ||
      `${memberProfile.nameFirst ?? ''} ${memberProfile.nameLast ?? ''}`.trim() ||
      accountId;

    const userPhoto = memberProfile.accountPhoto ?? FALLBACK_PHOTO;

    if (!detail) {
      return (
        <div className="grid gap-6">
          <BackButton href={`/access/team?portfolio=${portfolio}`} />
          <PageHeader
            photo={userPhoto}
            displayName={displayName}
            description={
              <>
                <span className="font-medium text-foreground">{displayName}</span> is not a member
                of portfolio <span className="font-medium text-foreground">{portfolioName}</span>
              </>
            }
          />
          <EmptyRoles message={`${displayName} has no access to this portfolio yet.`} />
          <div className="flex justify-start">
            <InviteButton
              displayName={displayName}
              confirmDescription={`This will invite ${displayName} to portfolio "${portfolioName}". They will join with no roles assigned initially.`}
              action={inviteToPortfolio.bind(null, portfolio, accountId)}
              redirectTo={`/access/assign?account=${accountId}&portfolio=${portfolio}`}
            />
          </div>
        </div>
      );
    }

    if (detail.status === 'invited' || detail.status === 'expired') {
      const isExpired = detail.status === 'expired';
      const expiresOn = detail.invitationExpiresOn
        ? new Date(detail.invitationExpiresOn)
        : null;
      const formattedExpiry = expiresOn
        ? expiresOn.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;

      return (
        <div className="grid gap-6">
          <BackButton href={`/access/team?portfolio=${portfolio}`} />
          <PageHeader
            photo={userPhoto}
            displayName={displayName}
            description={
              <>
                <span className="font-medium text-foreground">{displayName}</span> has been invited
                to portfolio <span className="font-medium text-foreground">{detail.portfolioName}</span>
              </>
            }
          />
          {isExpired ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                This invitation expired{formattedExpiry ? ` on ${formattedExpiry}` : ''} and can no longer be accepted.
              </p>
            </div>
          ) : (
            <InvitedBanner
              message={`Invitation pending${formattedExpiry ? ` — expires ${formattedExpiry}` : ''}. Waiting for ${displayName} to accept.`}
            />
          )}
          <div className="flex gap-2">
            <RemoveMemberButton
              label={isExpired ? 'Remove Expired Invitation' : 'Cancel Invitation'}
              confirmTitle={isExpired ? 'Remove expired invitation?' : 'Cancel invitation?'}
              confirmDescription={
                isExpired
                  ? `This will remove the expired invitation for ${displayName} from portfolio "${detail.portfolioName}".`
                  : `This will cancel the pending invitation for ${displayName} to join portfolio "${detail.portfolioName}".`
              }
              action={cancelPortfolioInvitation.bind(null, portfolio, accountId)}
              redirectTo={`/access/assign?account=${accountId}&portfolio=${portfolio}`}
              type="outlined"
            />
            {isExpired && (
              <InviteButton
                displayName={displayName}
                confirmDescription={`This will send a new invitation to ${displayName} to join portfolio "${detail.portfolioName}".`}
                action={inviteToPortfolio.bind(null, portfolio, accountId)}
                redirectTo={`/access/assign?account=${accountId}&portfolio=${portfolio}`}
              />
            )}
          </div>
        </div>
      );
    }

    const isSelfView = accountId === activeAccountId;
    const targetFlags = await getPortfolioMemberFlags(portfolio, accountId);
    const targetIsPermanentOwner =
      targetFlags?.hasFullAccess === true && targetFlags?.isPermanent === true;
    const callerIsPermanentOwner =
      callerFlags?.hasFullAccess === true && callerFlags?.isPermanent === true;

    let canRemove = false;
    let removeBlockedReason: string | null = null;

    if (isSelfView) {
      const otherOwnerExists = await hasOtherPermanentOwner(portfolio, activeAccountId);
      if (otherOwnerExists) {
        canRemove = true;
      } else {
        removeBlockedReason =
          'You cannot leave this portfolio because there is no other permanent full-access member.';
      }
    } else if (targetIsPermanentOwner && !callerIsPermanentOwner) {
      removeBlockedReason =
        'Only a permanent full-access member can remove another permanent full-access member.';
    } else {
      canRemove = true;
    }

    return (
      <div className="grid gap-6">
        <BackButton href={`/access/team?portfolio=${portfolio}`} />
        <PageHeader
          photo={userPhoto}
          displayName={displayName}
          description={
            <>
              Assign roles for <span className="font-medium text-foreground">{displayName}</span> on portfolio{' '}
              <span className="font-medium text-foreground">{detail.portfolioName}</span>
            </>
          }
        />
        {detail.roles.length > 0 ? (
          <Card>
            <CardContent className="divide-y p-0">
              {detail.roles.map((role, i) => (
                <RoleCard
                  key={`${role.roleId}-${i}`}
                  platformLabel={role.assetType.replace(/_/g, ' ')}
                  contextName={role.assetName}
                  roleName={role.roleName}
                  roleDescription={role.roleDescription}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyRoles message="This member has no roles assigned on assets in this portfolio." />
        )}
        <Card>
          <CardContent className="p-0">
            <AssignPermissionsWizard
              action={bulkAssignPermissionsFromForm.bind(null, portfolio)}
              members={[{ id: accountId, accountId, displayName }]}
              existingAssetIds={Array.from(new Set(
                detail.roles.map((role) => role.assetId).filter(Boolean),
              ))}
              groupId={portfolio}
              initialMemberAccountId={accountId}
            />
          </CardContent>
        </Card>
        {canRemove && (
          <div className="flex justify-start">
            <RemoveMemberButton
              label={isSelfView ? 'Leave Portfolio' : 'Remove from Portfolio'}
              confirmTitle={isSelfView ? 'Leave portfolio?' : 'Remove from portfolio?'}
              confirmDescription={
                isSelfView
                  ? `You will be removed from portfolio "${detail.portfolioName}" and lose all your asset roles within it.`
                  : `This will remove ${displayName} from portfolio "${detail.portfolioName}" and revoke all their asset roles within it.`
              }
              action={removePortfolioMember.bind(null, portfolio, accountId)}
              redirectTo={isSelfView ? '/access' : `/access/team?portfolio=${portfolio}`}
            />
          </div>
        )}
        {!canRemove && removeBlockedReason && (
          <p className="text-sm text-muted-foreground">{removeBlockedReason}</p>
        )}
      </div>
    );
  }

  if (!accountId && selectedProfileParam && !portfolio && !connectionId) {
    const directAccessContext = await resolveAccessProfileContext({
      selectedProfile: selectedProfileParam,
      workingProfile,
      requiredPermissions: ACCESS_TEAM_ADD_PERMISSIONS,
    });
    if (!directAccessContext) notFound();

    const ownerProfile = await getUserProfile(directAccessContext.selectedProfile);
    const ownerName = ownerProfile?.nameDisplay ?? directAccessContext.selectedProfile;

    return (
      <div className="grid gap-6">
        <BackButton href={appendAccessContext('/access/team')} />
        <PrimaryHeader
          title="Assign Account Access"
          description={`Enter a NeupID to assign access for ${ownerName}.`}
        />
        <Card>
          <CardContent className="p-4">
            <AddUserForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accountId) {
    const directAccessContext = await resolveAccessProfileContext({
      selectedProfile: selectedProfileParam,
      workingProfile,
      requiredPermissions: ACCESS_TEAM_ADD_PERMISSIONS,
    });
    if (!directAccessContext) notFound();

    const activeAccountId = directAccessContext.selectedProfile;
    const selectedOwnerContext = directAccessContext.selectedProfile;

    const [detail, ownerProfile, isPendingInvitation, assignmentOptions] = await Promise.all([
      getDirectMemberDetail(activeAccountId, accountId),
      getUserProfile(activeAccountId),
      hasPendingDirectInvitation(activeAccountId, accountId),
      getDirectAccessAssignmentOptions(selectedOwnerContext),
    ]);

    if (!detail) notFound();

    const userPhoto = detail.accountPhoto ?? FALLBACK_PHOTO;
    const ownerName = ownerProfile?.nameDisplay ?? activeAccountId;
    const isOwnerAccount = accountId === activeAccountId;
    const visibleRoles = detail.roles.filter((role) => !role.roleId.startsWith(DIRECT_CUSTOM_ROLE_PREFIX));
    const isActiveMember = detail.membershipStatus === 'active';
    const hasNoAccess = detail.membershipStatus === 'none';

    const avatar = (
      <PlatformAvatar userPhoto={userPhoto} platformLogo={NEUPID_LOGO} platformName="NeupID" />
    );

    return (
      <div className="grid gap-6">
        <BackButton href={appendAccessContext('/access/team')} />
        <PageHeader
          photo={userPhoto}
          displayName={detail.displayName}
          description={
            isOwnerAccount ? (
              <>Assign roles on your own account.</>
            ) : (
              <>
                Assign roles to <span className="font-medium text-foreground">{detail.displayName}</span> for account
                of <span className="font-medium text-foreground">{ownerName}</span>
              </>
            )
          }
        />
        {isPendingInvitation && (
          <InvitedBanner
            message={`An invitation has been sent to ${detail.displayName}. Waiting for them to accept.`}
          />
        )}
        {!isOwnerAccount && isActiveMember && (
          <DirectMemberAccessForm
            memberAccountId={accountId}
            memberDisplayName={detail.displayName}
            roles={assignmentOptions.roles}
            assignedRoleIds={visibleRoles.map((role) => role.roleId)}
          />
        )}
        {visibleRoles.length > 0 ? (
          <Card>
            <CardContent className="divide-y p-0">
              {visibleRoles.map((role, i) => (
                <RoleCard
                  key={`${role.roleId}-${i}`}
                  platformLabel="NeupID"
                  contextName={detail.displayName}
                  roleName={role.roleName}
                  roleDescription={role.roleDescription}
                  avatar={avatar}
                />
              ))}
            </CardContent>
          </Card>
        ) : !isPendingInvitation ? (
          <EmptyRoles message="This account has no roles assigned on your account." />
        ) : null}
        {!isOwnerAccount && (
          <div className="flex justify-start">
            {hasNoAccess ? (
              <InviteButton
                displayName={detail.displayName}
                confirmDescription={`This will send an access invitation to ${detail.displayName}. They will be able to accept or decline it.`}
                action={inviteDirectMember.bind(null, accountId, selectedOwnerContext)}
                redirectTo={appendAccessContext('/access/team')}
              />
            ) : isPendingInvitation || detail.membershipStatus === 'invited' ? (
              <RemoveMemberButton
                label="Cancel Invitation"
                confirmTitle="Cancel invitation?"
                confirmDescription={`This will cancel the pending access invitation sent to ${detail.displayName}. They will no longer be able to accept it.`}
                action={cancelDirectInvitation.bind(null, accountId, selectedOwnerContext)}
                redirectTo={appendAccessContext('/access/team')}
                type="outlined"
              />
            ) : (
              <RemoveMemberButton
                label="Remove All Access"
                confirmTitle="Remove all access?"
                confirmDescription={`This will remove all roles ${detail.displayName} holds on your account. This cannot be undone.`}
                action={removeDirectMember.bind(null, accountId, selectedOwnerContext)}
                redirectTo={appendAccessContext('/access/team')}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (portfolio) notFound();
  notFound();
}
