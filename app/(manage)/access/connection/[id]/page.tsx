import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FlowLink } from '@/components/ui/flow-link';
import { AppWindow, ChevronRight, Plus, UserCircle, Users } from '@/components/icons';
import { getConnectionDetail } from '../actions';
import { ACCESS_CONNECTION_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { resolveAccessProfileContext } from '@/services/account/access-profile-context';

/**
 * ::neup.documentation::connection-detail-page
 * ::title Connection Detail Page
 *
 * Shows the accounts that currently have direct access to one application connection.
 *
 * ::public
 *
 * The page lists current members and, when permitted, exposes a dedicated card that takes the current profile to the connection access assignment page.
 *
 * ::public end
 *
 * ::private
 *
 * The page stays presentation-only and delegates assignment eligibility plus form behavior to the nested assign route.
 *
 * ::private end
 *
 * ::end
 */
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workingProfile?: string; selectedProfile?: string; mode?: string }>;
};

function appendAccessContext(
  href: string,
  context: { selectedProfile?: string; mode?: string; workingProfile?: string },
) {
  const params = new URLSearchParams();
  const [pathname, query = ''] = href.split('?', 2);
  const existingParams = new URLSearchParams(query);

  existingParams.forEach((value, key) => {
    params.append(key, value);
  });
  if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
  if (context.mode) params.set('mode', context.mode);
  if (context.workingProfile) params.set('workingProfile', context.workingProfile);

  return `${pathname}?${params.toString()}`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'missing'
      ? 'bg-red-500'
      : status === 'active'
      ? 'bg-emerald-500'
      : status === 'paused'
      ? 'bg-amber-500'
      : 'bg-muted-foreground';

  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      aria-label={status}
      title={status}
    />
  );
}

function AccessCard({
  connectionId,
  displayName,
  accountId,
  accountPhoto,
  roles,
  className,
}: {
  connectionId: string;
  displayName: string;
  accountId: string;
  accountPhoto?: string;
  roles: Array<{ roleId: string; roleName: string; roleDescription: string | null }>;
  className?: string;
}) {
  return (
    <FlowLink
      href={`/access/assign?connection=${encodeURIComponent(connectionId)}&account=${encodeURIComponent(accountId)}`}
      className={`block border bg-background p-4 transition-colors duration-200 hover:relative hover:z-10 hover:border-muted-foreground/40 hover:bg-muted/20 ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {accountPhoto ? (
            <Image src={accountPhoto} alt={displayName} width={40} height={40} className="h-full w-full object-cover" />
          ) : (
            <UserCircle className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{accountId}</p>
        </div>
      </div>
      {roles.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {roles.map((role) => (
            <Badge key={role.roleId} variant="outline" className="px-1.5 py-0 text-xs">
              {role.roleName}
            </Badge>
          ))}
        </div>
      ) : null}
    </FlowLink>
  );
}

function AccessEmptyState() {
  return (
    <div className="flex items-center gap-3 px-0 py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <UserCircle className="h-4 w-4 text-muted-foreground" />
      </span>
      <p className="text-sm text-muted-foreground">
        You have not created access to this connection.
      </p>
    </div>
  );
}

export default async function ConnectionDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { workingProfile, selectedProfile, mode } = await searchParams;
  const accessContext = await resolveAccessProfileContext({
    selectedProfile,
    workingProfile,
    requiredPermissions: ACCESS_CONNECTION_VIEW_PERMISSIONS,
  });

  if (!accessContext) notFound();

  const hrefContext = {
    selectedProfile: accessContext.selectedProfile,
    mode,
    workingProfile,
  };
  const connection = await getConnectionDetail(id, accessContext.selectedProfile, {
    skipPermissionCheck: true,
  });

  if (!connection) notFound();
  const hasAccess = connection.members.length > 0;
  const headerStatus = hasAccess ? connection.connectionStatus : 'missing';
  const stackCount = connection.canGrantDirectAccess ? connection.members.length + 1 : connection.members.length;

  return (
    <div className="grid gap-8">
      <BackButton href={appendAccessContext('/access/connection', hrefContext)} />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <AppWindow className="h-4 w-4 shrink-0 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">
                Connection to {connection.appName}
              </h1>
              <StatusDot status={headerStatus} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {connection.appDescription ?? `Description of ${connection.appName}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{connection.accessCount}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl">
        {connection.canGrantDirectAccess ? (
          <FlowLink href={`/access/assign?connection=${encodeURIComponent(connection.id)}`} className="block">
            <Card className="rounded-none border-b-0 transition-colors duration-200 hover:relative hover:z-10 hover:border-muted-foreground/40 hover:bg-muted/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Add people to this connection</p>
                      <p className="text-sm text-muted-foreground">
                        Grant direct access to accounts that already have an active {connection.appName} connection.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                </div>
              </CardContent>
            </Card>
          </FlowLink>
        ) : null}

        {hasAccess ? (
          <div>
            {connection.members.map((member, index) => {
              const isLast = index === connection.members.length - 1;
              const isOnlyCard = stackCount === 1;
              const className = isOnlyCard
                ? 'rounded-xl'
                : isLast
                ? 'rounded-b-xl'
                : 'border-b-0 rounded-none';

              return (
              <AccessCard
                key={member.accountId}
                connectionId={connection.id}
                displayName={member.displayName}
                accountId={member.accountId}
                accountPhoto={member.accountPhoto}
                roles={member.roles}
                className={className}
              />
              );
            })}
          </div>
        ) : (
          <Card className={connection.canGrantDirectAccess ? 'rounded-b-xl' : 'rounded-xl'}>
            <CardContent className="p-4">
              <AccessEmptyState />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
