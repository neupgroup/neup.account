import Link from 'next/link';
import { FlowLink } from '@/components/ui/flow-link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { deleteManagedApplicationFromDetailsPage } from '@/services/applications/form-actions';
import { getSilentSsoOrigins } from '@/services/applications/manage';
import { AppWindow, Building, BarChart, Share2, ExternalLink, ChevronRight, type LucideIcon } from '@/components/icons';
type ApplicationDetailPageProps = {
  params: Promise<{ id: string }>;
};

function iconFor(appIcon?: string): LucideIcon {
  const appIconMap: Record<string, LucideIcon> = {
    'app-window': AppWindow,
    building: Building,
    'bar-chart': BarChart,
    'share-2': Share2,
  };
  return appIcon ? (appIconMap[appIcon] || AppWindow) : AppWindow;
}

function LinkOrDisabledButton({
  href,
  enabledLabel,
  disabledLabel,
  enabled,
}: {
  href?: string;
  enabledLabel: string;
  disabledLabel: string;
  enabled: boolean;
}) {
  if (!href || !enabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {disabledLabel}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
        {enabledLabel}
        <ExternalLink className="h-4 w-4" />
      </Link>
    </Button>
  );
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  development: 'secondary',
  rejected: 'destructive',
  blocked: 'destructive',
};

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) {
    notFound();
  }

  const Icon = iconFor(details.icon);
  const deleteAction = deleteManagedApplicationFromDetailsPage.bind(null, id, '/application');

  const silentSsoOrigins = details.canDelete ? await getSilentSsoOrigins(id) : [];

  const accessItems = details.hasUsedApp ? details.accessedData : details.configuredAccess;
  const termsTitle = details.hasUsedApp ? 'Terms agreed by user' : 'Terms to agree before using app';
  const connectedAtFormatted = details.connectedAt
    ? new Date(details.connectedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/40 shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{details.name}</h1>
              {details.isRootViewer && details.status && (
                <Badge variant={statusVariant[details.status] ?? 'outline'} className="capitalize">
                  {details.status}
                </Badge>
              )}
              {details.isRootViewer && details.isInternal && (
                <Badge variant="outline">Internal</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{details.description || 'No description available.'}</p>
            {details.website && (
              <a
                href={details.website}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
              >
                {details.website}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <Button variant="outline" asChild className="shrink-0">
          <FlowLink href="/data/appconnection">Back</FlowLink>
        </Button>
      </div>

      {/* Connection info — shown when user has an ApplicationConnection */}
      {connectedAtFormatted && (
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Your connection details for this application.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Connected on: </span>
              <span className="font-medium">{connectedAtFormatted}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Data access */}
      <Card>
        <CardHeader>
          <CardTitle>Data Access</CardTitle>
          <CardDescription>
            {details.hasUsedApp
              ? 'Data this app has accessed for your account.'
              : 'Data this app will access if you use it.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessItems.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {accessItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No access fields listed.</p>
          )}
        </CardContent>
      </Card>

      {/* Terms / policies */}
      <Card>
        <CardHeader>
          <CardTitle>{termsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {details.policies.length > 0 ? (
            <div className="space-y-3">
              {details.policies.map((policy) => (
                <div key={policy.name} className="rounded-md border p-3">
                  <p className="font-medium text-sm">{policy.name}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{policy.policy}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No terms published by this app.</p>
          )}
        </CardContent>
      </Card>

      {/* Account actions */}
      <Card>
        <CardHeader>
          <CardTitle>Account Actions</CardTitle>
          <CardDescription>Actions are enabled when you have used this app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Logout</p>
            <div className="flex flex-wrap gap-2">
              <LinkOrDisabledButton
                href={details.endpoints.logoutPage}
                enabled={details.hasUsedApp}
                enabledLabel="Open logout page"
                disabledLabel="Logout page unavailable"
              />
              <LinkOrDisabledButton
                href={details.endpoints.logoutApi}
                enabled={details.hasUsedApp}
                enabledLabel="Open logout API"
                disabledLabel="Logout API unavailable"
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Account Deletion</p>
            <div className="flex flex-wrap gap-2">
              <LinkOrDisabledButton
                href={details.endpoints.dataDeletionPage}
                enabled={details.hasUsedApp}
                enabledLabel="Open deletion page"
                disabledLabel="Deletion page unavailable"
              />
              <LinkOrDisabledButton
                href={details.endpoints.dataDeletionApi}
                enabled={details.hasUsedApp}
                enabledLabel="Open deletion API"
                disabledLabel="Deletion API unavailable"
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Account Block</p>
            <div className="flex flex-wrap gap-2">
              <LinkOrDisabledButton
                href={details.endpoints.accountBlockApi}
                enabled={details.hasUsedApp}
                enabledLabel="Open block API"
                disabledLabel="Block API unavailable"
              />
            </div>
            {details.endpoints.accountBlock && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {details.endpoints.accountBlock}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Owner-only sections */}
      {details.canDelete && (
        <>
          <div className="grid gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Manage Application</h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <FlowLink
                href={`/data/appconnection/${id}/meta`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">General Info</p>
                  <p className="text-sm text-muted-foreground">Edit name, description, icon, and website.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/status`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Status</p>
                  <p className="text-sm text-muted-foreground">Request publication and view the activity log.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/permission`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Permissions</p>
                  <p className="text-sm text-muted-foreground">Define individual permissions this application can assign.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/roles`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Roles</p>
                  <p className="text-sm text-muted-foreground">Group permissions into roles for access grants.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/access`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Access &amp; Permissions</p>
                  <p className="text-sm text-muted-foreground">Manage your account's access to this application.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/ownership`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Ownership</p>
                  <p className="text-sm text-muted-foreground">View who owns and has access to this application.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>

              <FlowLink
                href={`/data/appconnection/${id}/silent-sso-origins`}
                className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium">Silent SSO Origins</p>
                  <p className="text-sm text-muted-foreground">
                    {silentSsoOrigins.length > 0
                      ? `${silentSsoOrigins.length} origin${silentSsoOrigins.length === 1 ? '' : 's'} registered.`
                      : 'Trusted origins for the NeupID iframe bridge.'}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>
            </div>
          </div>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle>Owner Actions</CardTitle>
              <CardDescription>Only the owner of this app can delete it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={deleteAction}>
                <Button type="submit" variant="destructive">
                  Delete Application
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {/* Non-owner: access management link */}
      {!details.canDelete && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <FlowLink
            href={`/data/appconnection/${id}/access`}
            className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Access &amp; Permissions</p>
              <p className="text-sm text-muted-foreground">Manage your account's access to this application.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>
        </div>
      )}
    </div>
  );
}
