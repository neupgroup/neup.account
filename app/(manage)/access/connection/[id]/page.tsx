import { notFound } from 'next/navigation';
import Image from 'next/image';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppWindow, Clock, UserCircle, Users } from '@/components/icons';
import { getConnectionDetail } from '../actions';

type PageProps = {
  params: Promise<{ id: string }>;
};

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active'
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

function AccessRow({
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
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
        {accountPhoto ? (
          <Image src={accountPhoto} alt={displayName} width={40} height={40} className="h-full w-full object-cover" />
        ) : (
          <UserCircle className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{accountId}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {roles.map((role) => (
          <Badge key={role.roleId} variant="outline" className="text-xs px-1.5 py-0">
            {role.roleName}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default async function ConnectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const connection = await getConnectionDetail(id);

  if (!connection) notFound();

  return (
    <div className="grid gap-8">
      <BackButton href="/access/connection" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Connection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who has access to this specific connection and what role they have.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{connection.accessCount}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                <AppWindow className="h-5 w-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-base font-semibold truncate">
                    {connection.appName}
                  </CardTitle>
                  <StatusDot status={connection.connectionStatus} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Connected {new Date(connection.connectedAt).toLocaleDateString()}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {connection.roleName ?? 'Member'}
                  {connection.roleDescription ? ` · ${connection.roleDescription}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You and {Math.max(connection.accessCount - 1, 0)} others.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">
              {connection.appStatus ?? 'active'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Who has access</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {connection.members.length > 0 ? (
            <div className="divide-y">
              {connection.members.map((member) => (
                <AccessRow
                  key={member.accountId}
                  displayName={member.displayName}
                  accountId={member.accountId}
                  accountPhoto={member.accountPhoto}
                  roles={member.roles}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-8">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                No one has been granted access to this connection yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
