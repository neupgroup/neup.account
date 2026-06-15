import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCircle } from '@/components/icons';
import { getUserDetails, getManagedAccountAccessMembers, getManagedAccountAccessPermissions } from '@/services/manage/users';
import { getGrantedAccountPermission } from '@/services/user';
import { getPersonalAccountId } from '@/core/auth/verify';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import { ManagedAccountAccessForm } from './form';
import { RemoveMemberButton } from '@/app/(manage)/access/_components/remove-member-button';
import { revokeManagedAccountAccess } from '@/services/manage/users';
import { ACCOUNT_ACCESS_PERMISSION_GROUPS } from '@/core/auth/account-access-permissions';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ selectedId?: string }>;
};

function PermissionBadges({ permissions }: { permissions: string[] }) {
  const visible = permissions.slice(0, 3);
  const hiddenCount = Math.max(permissions.length - visible.length, 0);

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((permission) => (
        <Badge key={permission} variant="secondary" className="font-normal">
          {permission}
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
          Add an account above to grant permissions immediately without sending an invitation.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function ManagedAccountAccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { selectedId } = await searchParams;
  const targetAccountId = selectedId?.trim() || id;

  const viewerAccountId = await getPersonalAccountId();
  if (!viewerAccountId) {
    notFound();
  }

  const [grantedPermissions, userDetails] = await Promise.all([
    getGrantedAccountPermission(viewerAccountId, targetAccountId),
    getUserDetails(targetAccountId),
  ]);

  const canViewAccess = hasAnyPermission(grantedPermissions, ACCOUNT_ACCESS_PERMISSION_GROUPS.view)
    || hasAnyPermission(grantedPermissions, ACCOUNT_ACCESS_PERMISSION_GROUPS.edit);
  const canEditAccess = hasAnyPermission(grantedPermissions, ACCOUNT_ACCESS_PERMISSION_GROUPS.edit);

  if (!canViewAccess || !userDetails) {
    notFound();
  }

  const [permissions, members] = await Promise.all([
    getManagedAccountAccessPermissions(),
    getManagedAccountAccessMembers(targetAccountId),
  ]);

  console.log('[manage/access] selected account permissions', {
    viewerAccountId,
    targetAccountId,
    permissions: grantedPermissions,
  });

  return (
    <div className="grid gap-8">
      <BackButton href={`/manage/${id}`} />

      <div className="grid gap-2">
        <PrimaryHeader
          title="Account Access"
          description={`Grant direct access to @${userDetails.neupId} without sending an invitation.`}
        />
        <p className="text-sm text-muted-foreground">
          This page only exposes accounts with a direct access grant. Use it for immediate access assignment, not request-based invitations.
        </p>
      </div>

      <ManagedAccountAccessForm
        accountId={targetAccountId}
        permissions={permissions}
        canEdit={canEditAccess}
      />

      <div className="space-y-2">
        <SecondaryHeader
          title="Current Access"
          description="Accounts that currently have direct access to this account."
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
                        {member.grantCount} grant{member.grantCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <PermissionBadges permissions={member.permissions} />
                    <p className="text-xs text-muted-foreground">
                      {member.roleDescription ?? 'Direct access role'}
                    </p>
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
