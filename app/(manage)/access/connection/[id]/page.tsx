import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AppWindow, UserCircle, Users } from '@/components/icons';
import { getConnectionDetail } from '../actions';

type PageProps = {
  params: Promise<{ id: string }>;
};

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
  displayName,
  accountId,
  accountPhoto,
  roles,
}: {
  displayName: string;
  accountId: string;
  accountPhoto?: string;
  roles: Array<{ roleId: string; roleName: string; roleDescription: string | null }>;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
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
    </div>
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

export default async function ConnectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const connection = await getConnectionDetail(id);

  if (!connection) notFound();
  const hasAccess = connection.members.length > 0;
  const headerStatus = hasAccess ? connection.connectionStatus : 'missing';

  return (
    <div className="grid gap-8">
      <BackButton href="/access/connection" />

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

      <div className="grid gap-3">
        {hasAccess ? (
          <div className="grid gap-3">
            {connection.members.map((member) => (
              <AccessCard
                key={member.accountId}
                displayName={member.displayName}
                accountId={member.accountId}
                accountPhoto={member.accountPhoto}
                roles={member.roles}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-4">
              <AccessEmptyState />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
