import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '#/components/element/backButton';
import { Card, CardContent } from '#/components/ui/card';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { UserCircle, Clock } from '@/components/icons';
import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile } from '@/services/user';
import prisma from '@/.neup/core/database/prisma';
import {
  getDirectMemberDetail,
  getPortfolioMemberDetail,
  getMyDirectRoles,
  getMyPortfolioRoles,
} from '@/services/manage/access';
import { RemoveMemberButton } from '../_components/remove-member-button';
import { InviteButton } from '../_components/invite-button';
import {
  removeDirectMember,
  cancelDirectInvitation,
  removePortfolioMember,
  cancelPortfolioInvitation,
  inviteToPortfolio,
  inviteDirectMember,
  getDirectAccessAssignmentOptions,
} from '../_components/actions';
import { FlowLink } from '@/components/flow-link';
import { DirectMemberAccessForm } from '../_components/direct-member-access-form';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { ACCESS_TEAM_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { permission } from '@/.neup/logica/permission';

const pagePermissions = [
  permission('access.team.view.self', 'for_individual', 'page'),
];

type PageProps = {
  searchParams: Promise<{ member_id?: string; portfolio?: string; workingProfile?: string }>;
};

const NEUPID_LOGO = 'https://neupgroup.com/assets/branding/neup.group/logo.svg';
const FALLBACK_PHOTO = 'https://neupgroup.com/assets/user.png';
const DIRECT_CUSTOM_ROLE_PREFIX = 'account.access.';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // A direct invitation has no parentPortfolioId in data
  return reqs.some(
    (r) => !(r.data as Record<string, unknown> | null)?.parentPortfolioId,
  );
}

/** Returns the portfolio name, or null if not found. */
async function getPortfolioName(parentPortfolioId: string): Promise<string | null> {
  void parentPortfolioId;
  return null;
}

type PortfolioMemberFlags = {
  hasFullAccess: boolean;
  isPermanent: boolean;
};

/** Returns the hasFullAccess and isPermanent flags for an active portfolio member, or null if not found. */
async function getPortfolioMemberFlags(
  parentPortfolioId: string,
  memberAccountId: string,
): Promise<PortfolioMemberFlags | null> {
  void parentPortfolioId;
  void memberAccountId;
  return null;
}

/**
 * Returns true if there is at least one active permanent full-access member in the
 * portfolio other than the given account.
 */
async function hasOtherPermanentOwner(
  parentPortfolioId: string,
  excludeAccountId: string,
): Promise<boolean> {
  void parentPortfolioId;
  void excludeAccountId;
  return false;
}

// ── Platform avatar ───────────────────────────────────────────────────────────

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

// ── Page header ───────────────────────────────────────────────────────────────

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

// ── Role card ─────────────────────────────────────────────────────────────────

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
              <Badge variant="secondary" className="text-xs font-normal">{contextName}</Badge>
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

// ── Invited banner ────────────────────────────────────────────────────────────

function InvitedBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

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

// ── /access/role — my own roles on my account ─────────────────────────────────

async function MyDirectRolesView() {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const [data, profile] = await Promise.all([
    getMyDirectRoles(accountId),
    getUserProfile(accountId),
  ]);
  if (!data) notFound();

  const userPhoto = profile?.accountPhoto ?? FALLBACK_PHOTO;
  const displayName = profile?.nameDisplay ?? data.myName;

  const avatar = (
    <PlatformAvatar userPhoto={userPhoto} platformLogo={NEUPID_LOGO} platformName="NeupID" />
  );

  return (
    <div className="grid gap-6">
      <BackButton href="/access" />
      <PageHeader
        photo={userPhoto}
        displayName={displayName}
        description={<>Roles assigned to you.</>}
      />
      {data.roles.length > 0 ? (
        <Card>
          <CardContent className="divide-y p-0">
            {data.roles.map((role, i) => (
              <RoleCard
                key={`${role.roleId}-${i}`}
                platformLabel="NeupID"
                contextName={displayName}
                roleName={role.roleName}
                roleDescription={role.roleDescription}
                avatar={avatar}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyRoles message="You have no direct roles assigned on this account." />
      )}
    </div>
  );
}

// ── /access/role?portfolio=[id] — my own roles on a portfolio ─────────────────

async function MyPortfolioRolesView({ parentPortfolioId }: { parentPortfolioId: string }) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const [data, profile] = await Promise.all([
    getMyPortfolioRoles(parentPortfolioId),
    getUserProfile(accountId),
  ]);
  if (!data) notFound();

  const userPhoto = profile?.accountPhoto ?? FALLBACK_PHOTO;
  const displayName = profile?.nameDisplay ?? data.myName;

  return (
    <div className="grid gap-6">
      <BackButton href={`/access?portfolio=${parentPortfolioId}`} />
      <PageHeader
        photo={userPhoto}
        displayName={displayName}
        description={<>Role assigned to <span className="font-medium text-foreground">{displayName}</span> on portfolio <span className="font-medium text-foreground">{data.portfolioName}</span></>}
      />
      {data.roles.length > 0 ? (
        <Card>
          <CardContent className="divide-y p-0">
            {data.roles.map((role, i) => (
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
        <EmptyRoles message="You have no roles assigned on assets in this portfolio." />
      )}
    </div>
  );
}

// ── /access/role?member_id=[id] — a member's roles on my account ─────────────

async function MemberDirectRolesView({ memberAccountId }: { memberAccountId: string }) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const [detail, ownerProfile, isPendingInvitation, assignmentOptions] = await Promise.all([
    getDirectMemberDetail(accountId, memberAccountId),
    getUserProfile(accountId),
    hasPendingDirectInvitation(accountId, memberAccountId),
    getDirectAccessAssignmentOptions(),
  ]);

  // Profile must exist for the account to be valid
  if (!detail) notFound();

  const userPhoto = detail.accountPhoto ?? FALLBACK_PHOTO;
  const ownerName = ownerProfile?.nameDisplay ?? accountId;
  const isOwnerAccount = memberAccountId === accountId;
  const visibleRoles = detail.roles.filter((role) => !role.roleId.startsWith(DIRECT_CUSTOM_ROLE_PREFIX));
  const isActiveMember = detail.membershipStatus === 'active';
  const hasNoAccess = detail.membershipStatus === 'none';

  const avatar = (
    <PlatformAvatar userPhoto={userPhoto} platformLogo={NEUPID_LOGO} platformName="NeupID" />
  );

  return (
    <div className="grid gap-6">
      <BackButton href="/access/team" />

      <PageHeader
        photo={userPhoto}
        displayName={detail.displayName}
        description={
          isOwnerAccount ? (
            <>Roles assigned to you.</>
          ) : (
            <>
              Roles assigned to{' '}
              <span className="font-medium text-foreground">{detail.displayName}</span> for account
              of <span className="font-medium text-foreground">{ownerName}</span>
            </>
          )
        }
      />

      {/* Pending invitation banner */}
      {isPendingInvitation && (
        <InvitedBanner
          message={`An invitation has been sent to ${detail.displayName}. Waiting for them to accept.`}
        />
      )}

      {!isOwnerAccount && isActiveMember && (
        <DirectMemberAccessForm
          memberAccountId={memberAccountId}
          memberDisplayName={detail.displayName}
          roles={assignmentOptions.roles}
          assignedRoleIds={visibleRoles.map((role) => role.roleId)}
        />
      )}

      {/* Roles list */}
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

      {/* Actions */}
      {!isOwnerAccount && (
        <div className="flex justify-start">
          {hasNoAccess ? (
            // No access and no pending invitation — offer to invite
            <InviteButton
              displayName={detail.displayName}
              confirmDescription={`This will send an access invitation to ${detail.displayName}. They will be able to accept or decline it.`}
              action={inviteDirectMember.bind(null, memberAccountId)}
              redirectTo="/access/team"
            />
          ) : isPendingInvitation || detail.membershipStatus === 'invited' ? (
            <RemoveMemberButton
              label="Cancel Invitation"
              confirmTitle="Cancel invitation?"
              confirmDescription={`This will cancel the pending access invitation sent to ${detail.displayName}. They will no longer be able to accept it.`}
              action={cancelDirectInvitation.bind(null, memberAccountId)}
              redirectTo="/access/team"
              variant="outline"
            />
          ) : (
            <RemoveMemberButton
              label="Remove All Access"
              confirmTitle="Remove all access?"
              confirmDescription={`This will remove all roles ${detail.displayName} holds on your account. This cannot be undone.`}
              action={removeDirectMember.bind(null, memberAccountId)}
              redirectTo="/access/team"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── /access/role?member_id=[id]&portfolio=[id] — a member's roles on a portfolio ─

async function MemberPortfolioRolesView({
  memberAccountId,
  parentPortfolioId,
}: {
  memberAccountId: string;
  parentPortfolioId: string;
}) {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const [detail, memberProfile, callerFlags, portfolioName] = await Promise.all([
    getPortfolioMemberDetail(parentPortfolioId, memberAccountId),
    getUserProfile(memberAccountId),
    getPortfolioMemberFlags(parentPortfolioId, accountId),
    getPortfolioName(parentPortfolioId),
  ]);

  // Profile and portfolio must exist
  if (!memberProfile || !portfolioName) notFound();

  const displayName =
    memberProfile.nameDisplay ||
    `${memberProfile.nameFirst ?? ''} ${memberProfile.nameLast ?? ''}`.trim() ||
    memberAccountId;

  const userPhoto = memberProfile.accountPhoto ?? FALLBACK_PHOTO;

  // ── Not a member at all — offer to invite ────────────────────────────────
  if (!detail) {
    return (
      <div className="grid gap-6">
        <BackButton href={`/access/team?portfolio=${parentPortfolioId}`} />

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
            action={inviteToPortfolio.bind(null, parentPortfolioId, memberAccountId)}
            redirectTo={`/access/assign?account=${memberAccountId}&portfolio=${parentPortfolioId}`}
          />
        </div>
      </div>
    );
  }

  // ── Invited — show invitation state ──────────────────────────────────────
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
        <BackButton href={`/access/team?portfolio=${parentPortfolioId}`} />

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
          {/* Cancel invitation (remove the invited row) */}
          <RemoveMemberButton
            label={isExpired ? 'Remove Expired Invitation' : 'Cancel Invitation'}
            confirmTitle={isExpired ? 'Remove expired invitation?' : 'Cancel invitation?'}
            confirmDescription={
              isExpired
                ? `This will remove the expired invitation for ${displayName} from portfolio "${detail.portfolioName}".`
                : `This will cancel the pending invitation for ${displayName} to join portfolio "${detail.portfolioName}".`
            }
            action={cancelPortfolioInvitation.bind(null, parentPortfolioId, memberAccountId)}
            redirectTo={`/access/assign?account=${memberAccountId}&portfolio=${parentPortfolioId}`}
            variant="outline"
          />
          {/* Re-invite if expired */}
          {isExpired && (
            <InviteButton
              displayName={displayName}
              confirmDescription={`This will send a new invitation to ${displayName} to join portfolio "${detail.portfolioName}".`}
              action={inviteToPortfolio.bind(null, parentPortfolioId, memberAccountId)}
              redirectTo={`/access/assign?account=${memberAccountId}&portfolio=${parentPortfolioId}`}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Active confirmed member ───────────────────────────────────────────────
  const isSelfView = memberAccountId === accountId;
  const targetFlags = await getPortfolioMemberFlags(parentPortfolioId, memberAccountId);
  const targetIsPermanentOwner =
    targetFlags?.hasFullAccess === true && targetFlags?.isPermanent === true;
  const callerIsPermanentOwner =
    callerFlags?.hasFullAccess === true && callerFlags?.isPermanent === true;

  let canRemove = false;
  let removeBlockedReason: string | null = null;

  if (isSelfView) {
    const otherOwnerExists = await hasOtherPermanentOwner(parentPortfolioId, accountId);
    if (otherOwnerExists) {
      canRemove = true;
    } else {
      removeBlockedReason =
        'You cannot leave this portfolio because there is no other permanent full-access member.';
    }
  } else {
    if (targetIsPermanentOwner && !callerIsPermanentOwner) {
      removeBlockedReason =
        'Only a permanent full-access member can remove another permanent full-access member.';
    } else {
      canRemove = true;
    }
  }

  return (
    <div className="grid gap-6">
      <BackButton href={`/access/team?portfolio=${parentPortfolioId}`} />

      <PageHeader
        photo={userPhoto}
        displayName={displayName}
        description={
          <>
            Role assigned to{' '}
            <span className="font-medium text-foreground">{displayName}</span> on portfolio{' '}
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

      {detail.status === 'active' && (
        <div className="flex justify-start">
          <Button asChild>
            <FlowLink href={`/access/assign?portfolio=${parentPortfolioId}&member=${memberAccountId}`}>
              Assign Asset Roles
            </FlowLink>
          </Button>
        </div>
      )}

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
            action={removePortfolioMember.bind(null, parentPortfolioId, memberAccountId)}
            redirectTo={isSelfView ? '/access' : `/access/team?portfolio=${parentPortfolioId}`}
          />
        </div>
      )}

      {!canRemove && removeBlockedReason && (
        <p className="text-sm text-muted-foreground">{removeBlockedReason}</p>
      )}
    </div>
  );
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default async function RolePage({ searchParams }: PageProps) {
  await requireAnyPermission404([...ACCESS_TEAM_VIEW_PERMISSIONS]);
  const { member_id: memberAccountId, portfolio: parentPortfolioId, workingProfile } = await searchParams;

  if (memberAccountId && parentPortfolioId) {
    const params = new URLSearchParams({
      account: memberAccountId,
      portfolio: parentPortfolioId,
    });
    if (workingProfile) params.set('workingProfile', workingProfile);
    redirect(`/access/assign?${params.toString()}`);
  }

  if (memberAccountId) {
    const params = new URLSearchParams({
      account: memberAccountId,
    });
    if (workingProfile) params.set('workingProfile', workingProfile);
    redirect(`/access/assign?${params.toString()}`);
  }

  if (parentPortfolioId) {
    const params = new URLSearchParams({
      portfolio: parentPortfolioId,
    });
    if (workingProfile) params.set('workingProfile', workingProfile);
    redirect(`/access/assign?${params.toString()}`);
  }

  return <MyDirectRolesView />;
}
