import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCircle } from '@/components/icons';
import { getUserDetails, getManagedAccountAccessMembers, getManagedAccountAccessAssignableRoles } from '@/services/manage/users';
import { checkPermissions } from '@/services/user';
import { ManagedAccountAccessForm } from './form';
import { RemoveMemberButton } from '@/app/(manage)/access/_components/remove-member-button';
import { revokeManagedAccountAccess } from '@/services/manage/users';
import { ACCOUNT_ACCESS_PERMISSION_GROUPS } from '@/neup.core/auth/account-access-permissions';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
  permission('root.account.access.view', 'for_individual', 'page'),
  permission('root.account.access.edit', 'for_individual', 'page'),
];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ selectedId?: string }>;
};

function RoleBadges({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const visible = roles.slice(0, 3);
  const hiddenCount = Math.max(roles.length - visible.length, 0);

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((role) => (
        <Badge key={role.id} variant="secondary" className="font-normal">
          {role.name}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge variant="outline" className="font-normal">
          +{hiddenCount} more
        </Badge>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="font-medium">No direct access yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add an account above to assign direct access roles immediately without sending an invitation.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function ManagedAccountAccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { selectedId } = await searchParams;
  const targetAccountId = id;

  const [canViewAccess, canEditAccess, userDetails] = await Promise.all([
    checkPermissions(ACCOUNT_ACCESS_PERMISSION_GROUPS.view),
    checkPermissions(ACCOUNT_ACCESS_PERMISSION_GROUPS.edit),
    getUserDetails(targetAccountId),
  ]);

  if (!canViewAccess || !userDetails) {
    notFound();
  }

  const [roles, members] = await Promise.all([
    getManagedAccountAccessAssignableRoles(),
    getManagedAccountAccessMembers(targetAccountId),
  ]);

  return (
    <div className="grid gap-8">
      <BackButton href={`/manage/${id}`} />

      <div className="grid gap-2">
        <PrimaryHeader
          title="Account Access"
          description={`Assign direct access roles to @${userDetails.neupId} without sending an invitation.`}
        />
        <p className="text-sm text-muted-foreground">
          This page manages direct role assignments only. It does not support ad-hoc permission assignment or request-based invitations.
        </p>
      </div>

      <ManagedAccountAccessForm
        accountId={targetAccountId}
        roles={roles}
        canEdit={canEditAccess}
      />

      <div className="space-y-2">
        <SecondaryHeader
          title="Current Access"
          description="Accounts that currently hold direct roles on this account."
        />

        {members.length > 0 ? (
          <Card>
            <CardContent className="divide-y p-0">
              {members.map((member) => (
                <div key={member.accountId} className="flex items-start gap-4 px-4 py-4">
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                    {member.accountPhoto ? (
                      <Image
                        src={member.accountPhoto}
                        alt={member.displayName}
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{member.displayName}</p>
                      <Badge variant="outline" className="font-normal">
                        @{member.neupId}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {member.roles.length} role{member.roles.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <RoleBadges roles={member.roles} />
                  </div>
                  <div className="shrink-0">
                    <RemoveMemberButton
                      label="Revoke"
                      confirmTitle="Revoke direct access?"
                      confirmDescription={`This will remove ${member.displayName}'s direct access to this account.`}
                      action={revokeManagedAccountAccess.bind(null, { accountId: targetAccountId, memberId: member.accountId })}
                      redirectTo={`/manage/${targetAccountId}/access${selectedId ? `?selectedId=${encodeURIComponent(selectedId)}` : ''}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
