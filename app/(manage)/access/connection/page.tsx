import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppWindow, ExternalLink, UserCircle, UserPlus, Users } from '@/components/icons';
import { FlowLink } from '@/components/ui/flow-link';
import { getApplicationAccessPageData } from './actions';
import { AssignAppAccessForm } from './assign-app-access-form';
import { RevokeAppAccessButton } from './revoke-app-access-form';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const variant =
    status === 'active'
      ? 'default'
      : status === 'development'
      ? 'secondary'
      : 'outline';
  return (
    <Badge variant={variant} className="text-xs px-1.5 py-0 capitalize">
      {status}
    </Badge>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ApplicationAccessPage() {
  const apps = await getApplicationAccessPageData();

  return (
    <div className="grid gap-8">
      <BackButton href="/access" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Connection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your connected applications, your permissions, and who you've granted access to.
          </p>
        </div>
        {apps.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <AppWindow className="h-3.5 w-3.5" />
            <span>{apps.length}</span>
          </div>
        )}
      </div>

      {/* App list */}
      {apps.length > 0 ? (
        <div className="grid gap-6">
          {apps.map((app) => (
            <Card key={app.id}>
              {/* ── App header ── */}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                      <AppWindow className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold truncate">
                        {app.name}
                      </CardTitle>
                      {app.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {app.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    <StatusBadge status={app.status} />
                    <FlowLink
                      href={`/data/appconnection/${app.id}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </FlowLink>
                  </div>
                </div>

                {/* Connected date + my permissions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Connected {new Date(app.connectedAt).toLocaleDateString()}
                  </span>
                  {app.myRoles.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <div className="flex flex-wrap gap-1">
                        {app.myRoles.map((r) => (
                          <Badge
                            key={r.roleId}
                            variant="secondary"
                            className="text-xs px-1.5 py-0 font-mono"
                          >
                            {r.roleId}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {/* ── People with access ── */}
                <div className="border-t">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Access granted
                      </span>
                    </div>
                    {app.grantees.length > 0 && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {app.grantees.length}
                      </Badge>
                    )}
                  </div>

                  <div className="divide-y border-t">
                    {app.grantees.length > 0 ? (
                      app.grantees.map((grantee) => (
                        <div
                          key={grantee.accountId}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                            <UserCircle className="h-4 w-4 text-muted-foreground" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{grantee.displayName}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {grantee.accountId}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1">
                            {grantee.roles.map((role) => (
                              <Badge
                                key={role}
                                variant="outline"
                                className="text-xs px-1.5 py-0 font-mono"
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
                          No one else has been granted access yet.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Assign access form ── */}
                <div className="border-t">
                  <div className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Grant access
                      </span>
                    </div>
                  </div>
                  <div className="border-t">
                    <AssignAppAccessForm
                      appId={app.id}
                      availableRoles={app.availableRoles}
                    />
                  </div>
                </div>
              </CardContent>
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
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Connect to an application from the{' '}
                <FlowLink
                  href="/data/appconnection"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Applications
                </FlowLink>{' '}
                page first.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
