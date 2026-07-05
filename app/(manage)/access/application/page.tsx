import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AppWindow,
  ExternalLink,
  UserCircle,
  UserPlus,
  Users,
} from '@/components/icons';
import { FlowLink } from '@/components/ui/flow-link';
import { getApplicationAccessPageData } from '../connection/actions';
import { AssignAppAccessForm } from '../connection/assign-app-access-form';
import { RevokeAppAccessButton } from '../connection/revoke-app-access-form';
import { createPageMetadata } from '@/neup.core/metadata';
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { ACCESS_APPLICATION_VIEW_PERMISSIONS } from '@/neup.core/auth/access-view-permissions';
import { permission } from '@/neup.logica/permission';

export const metadata: Metadata = createPageMetadata('Application Management');

const pagePermissions = [
  permission('access.application.view.self', 'for_individual', 'page'),
];

type PageProps = {
  searchParams: Promise<{ application?: string; mode?: string }>;
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const variant =
    status === 'active' ? 'default' : status === 'development' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} className="px-1.5 py-0 text-xs capitalize">
      {status}
    </Badge>
  );
}

async function SelectedApplicationPage({
  applicationId,
  mode,
}: {
  applicationId: string;
  mode?: string;
}) {
  const apps = await getApplicationAccessPageData();

  const app = apps.find((item) => item.id === applicationId);
  if (!app) notFound();

  const modeSuffix = mode === 'root' ? '&mode=root' : '';

  return (
    <div className="grid gap-8">
      <BackButton href={mode === 'root' ? '/application?mode=root' : '/application'} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                <AppWindow className="h-5 w-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate text-lg font-semibold">{app.name}</CardTitle>
                {app.description ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {app.description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <StatusBadge status={app.status} />
              <FlowLink
                href={`/data/appconnection/${app.id}`}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </FlowLink>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Connected {new Date(app.connectedAt).toLocaleDateString()}
            </span>
            {app.myRoles.length > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <div className="flex flex-wrap gap-1">
                  {app.myRoles.map((role) => (
                    <Badge
                      key={role.roleId}
                      variant="secondary"
                      className="px-1.5 py-0 text-xs font-mono"
                    >
                      {role.roleId}
                    </Badge>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="border-t">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Access granted
                </span>
              </div>
              {app.grantees.length > 0 ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  {app.grantees.length}
                </Badge>
              ) : null}
            </div>

            <div className="divide-y border-t">
              {app.grantees.length > 0 ? (
                app.grantees.map((grantee) => (
                  <div key={grantee.accountId} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{grantee.displayName}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {grantee.accountId}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {grantee.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className="px-1.5 py-0 text-xs font-mono"
                        >
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <RevokeAppAccessButton
                      appId={app.id}
                      memberId={grantee.accountId}
                      displayName={grantee.displayName}
                    />
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-3 px-4 py-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    No one else has been granted direct access yet.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t">
            <div className="px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Grant direct access
                </span>
              </div>
            </div>
            <div className="border-t">
              <AssignAppAccessForm appId={app.id} availableRoles={app.availableRoles} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <FlowLink
          href={`/access/team?asset=${encodeURIComponent(app.id)}${modeSuffix}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Users className="h-4 w-4" />
          Manage asset members
        </FlowLink>
      </div>
    </div>
  );
}

async function ApplicationsOverviewPage({ mode }: { mode?: string }) {
  const apps = await getApplicationAccessPageData({ ownerOnly: true });
  const modeSuffix = mode === 'root' ? '&mode=root' : '';

  return (
    <div className="grid gap-8">
      <BackButton href="/access" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Applications you manage, your permissions, and who you've granted access to.
          </p>
        </div>
        {apps.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <AppWindow className="h-3.5 w-3.5" />
            <span>{apps.length}</span>
          </div>
        ) : null}
      </div>

      {apps.length > 0 ? (
        <div className="grid gap-6">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                      <AppWindow className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base font-semibold">{app.name}</CardTitle>
                      {app.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {app.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    <StatusBadge status={app.status} />
                    <FlowLink
                      href={`/access/application?application=${app.id}${modeSuffix}`}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Open
                    </FlowLink>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Connected {new Date(app.connectedAt).toLocaleDateString()}
                  </span>
                  {app.myRoles.length > 0 ? (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <div className="flex flex-wrap gap-1">
                        {app.myRoles.map((role) => (
                          <Badge
                            key={role.roleId}
                            variant="secondary"
                            className="px-1.5 py-0 text-xs font-mono"
                          >
                            {role.roleId}
                          </Badge>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <AppWindow className="h-6 w-6 text-muted-foreground" />
            </span>
            <div>
              <p className="text-sm font-medium">No applications connected</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Connect to an application from the{' '}
                <a
                  href="/application"
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  Applications
                </a>{' '}
                page first.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default async function ApplicationAccessPage({ searchParams }: PageProps) {
  await requireAnyPermission404([...ACCESS_APPLICATION_VIEW_PERMISSIONS]);
  const { application, mode } = await searchParams;

  if (application) {
    return <SelectedApplicationPage applicationId={application} mode={mode} />;
  }

  return <ApplicationsOverviewPage mode={mode} />;
}
