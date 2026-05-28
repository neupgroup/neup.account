import { FlowLink } from '@/components/ui/flow-link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApplicationDetailsForViewerV2, getApplicationUserStats } from '@/services/applications/manage';
import { deleteManagedApplicationFromDetailsPage } from '@/services/applications/form-actions';
import { AppWindow, Building, BarChart, Share2, ExternalLink, ChevronRight, Users, UserPlus, ArrowLeft, type LucideIcon } from '@/components/icons';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
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

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  development: 'secondary',
  rejected: 'destructive',
  blocked: 'destructive',
};

export default async function ApplicationDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode } = await searchParams;
  const modeSuffix = mode === 'root' ? '&mode=root' : '';
  const details = await getApplicationDetailsForViewerV2(id);

  if (!details) notFound();

  const Icon = iconFor(details.icon);
  const deleteAction = deleteManagedApplicationFromDetailsPage.bind(null, id);

  const [userStats] = await Promise.all([
    getApplicationUserStats(id),
  ]);

  return (
    <div className="grid gap-6">
      {/* Back */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href="/application">
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/40 shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{details.name}</h1>
              {details.status && (
                <Badge variant={statusVariant[details.status] ?? 'outline'} className="capitalize">
                  {details.status}
                </Badge>
              )}
              {details.isInternal && (
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
      </div>

      {/* User Stats */}
      <Card>
        <CardContent className="grid p-0 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x">
          {[
            { label: 'Total Users', value: userStats?.total ?? 0, description: 'All connected accounts', icon: Users },
            { label: 'Last 24 Hours', value: userStats?.last24h ?? 0, description: 'New connections today', icon: UserPlus },
            { label: 'Last 7 Days', value: userStats?.lastWeek ?? 0, description: 'New connections this week', icon: UserPlus },
            { label: 'Last 30 Days', value: userStats?.lastMonth ?? 0, description: 'New connections this month', icon: UserPlus },
          ].map(({ label, value, description, icon: Icon }) => (
            <FlowLink
              key={label}
              href={`/application/${id}/users`}
              className="group p-6 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="text-sm font-medium">{label}</h3>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </FlowLink>
          ))}
        </CardContent>
      </Card>

      {/* Manage Application */}
      <div className="grid gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Manage Application</h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <FlowLink
            href={`/application/${id}/edit`}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Basic Information</p>
              <p className="text-sm text-muted-foreground">Update name, description, icon, website, and status.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/application/${id}/config`}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Configuration</p>
              <p className="text-sm text-muted-foreground">API secret, response fields, and silent SSO origins.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/application/${id}/roles?mode=root`}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Roles &amp; Permissions</p>
              <p className="text-sm text-muted-foreground">Define permissions and group them into roles for access grants.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/application/${id}/permissions?mode=root`}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Permissions</p>
              <p className="text-sm text-muted-foreground">Create and manage permission definitions for this application.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/access/asset?asset=${id}${modeSuffix}`}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Access</p>
              <p className="text-sm text-muted-foreground">View who owns and has access to this application.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/data/activity?application=${id}`}
            className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Application Logs</p>
              <p className="text-sm text-muted-foreground">View activity and change history for this application.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>

          <FlowLink
            href={`/application/${id}/logs`}
            className="group flex items-center justify-between gap-4 border-t px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Development API Logs</p>
              <p className="text-sm text-muted-foreground">Inspect request and response logs captured while app status is development.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>
        </div>
      </div>

      {details.canDelete && (
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
      )}
    </div>
  );
}
