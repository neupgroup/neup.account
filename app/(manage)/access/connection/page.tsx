import type { Metadata } from 'next';
import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppWindow, ChevronRight, Users } from '@/components/icons';
import { FlowLink } from '@/components/ui/flow-link';
import { getConnectionPageData } from './actions';
import { createPageMetadata } from '@/core/metadata';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { ACCESS_CONNECTION_VIEW_PERMISSIONS } from '@/core/auth/access-view-permissions';
import { permission } from '@/logica/permission';

export const metadata: Metadata = createPageMetadata('Connection Management');

const pagePermissions = [
  permission('access.connection.view.self', 'for_individual', 'page'),
];

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

function AccessSummary({ accessCount }: { accessCount: number }) {
  const others = Math.max(accessCount - 1, 0);
  return (
    <span className="text-xs leading-4 text-muted-foreground">
      You and {others} others.
    </span>
  );
}

export default async function ConnectionPage() {
  await requireAnyPermission404([...ACCESS_CONNECTION_VIEW_PERMISSIONS]);
  const connections = await getConnectionPageData();

  return (
    <div className="grid gap-8">
      <BackButton href="/access" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All application connections on this account.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <AppWindow className="h-3.5 w-3.5" />
          <span>{connections.length}</span>
        </div>
      </div>

      {connections.length > 0 ? (
        <div className="grid gap-4">
          {connections.map((connection) => (
            <FlowLink key={connection.id} href={`/access/connection/${connection.id}`} className="block">
              <Card className="transition-colors hover:border-muted-foreground/40 hover:bg-muted/20">
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
                        <div className="mt-0">
                          <AccessSummary accessCount={connection.accessCount} />
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/70" />
                  </div>
                </CardHeader>
              </Card>
            </FlowLink>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <AppWindow className="h-6 w-6 text-muted-foreground" />
            </span>
            <div>
              <p className="text-sm font-medium">No connections yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect an application first to see it here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
