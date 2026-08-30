/*
::neup.documentation::application-detail-page

Server-rendered application detail page for the `/application` route.

Back-navigation and management links preserve `mode=root` so direct root-mode
entry stays in the same server-rendered context.

::end
*/

import { FlowLink } from '#/components/ui/flow-link';
import { notFound } from 'next/navigation';
import { Button } from '#/components/ui/button';
import { Badge } from '#/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import {
  getApplicationDetailPageData,
} from '@/services/applications/manage';
import { deleteManagedApplicationFromDetailsPage } from '@/services/applications/form-actions';
import { AppWindow, Building, BarChart, Share2, ExternalLink, ChevronRight, Users, UserPlus, ArrowLeft, type LucideIcon } from '@/components/icons';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

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

type Props = {
  applicationId: string;
  mode?: string;
};

export async function ApplicationDetailPage({ applicationId, mode }: Props) {
  const modeSuffix = mode === 'root' ? '&mode=root' : '';
  const pageData = await getApplicationDetailPageData(applicationId, { rootMode: mode === 'root' });
  if (!pageData) notFound();
  const { details, userStats, logPermissions, permissions } = pageData;

  const Icon = iconFor(details.icon);
  const deleteAction = deleteManagedApplicationFromDetailsPage.bind(
    null,
    applicationId,
    mode === 'root' ? '/application?mode=root' : '/application',
  );

  const managementCards = [
    permissions.canEditBasics
      ? {
          key: 'basics',
          href: applicationHref('/application/edit', applicationId, mode ? { mode } : undefined),
          title: 'Basic Information',
          description: 'Update name, description, icon, website, and status.',
        }
      : null,
    permissions.canViewConfig
      ? {
          key: 'config',
          href: applicationHref('/application/config', applicationId, mode ? { mode } : undefined),
          title: 'Configuration',
          description: 'API secret, response fields, and silent SSO origins.',
        }
      : null,
    permissions.canViewRoles
      ? {
          key: 'roles',
          href: applicationHref('/application/roles', applicationId, mode ? { mode } : undefined),
          title: 'Roles & Permissions',
          description: 'Define permissions and group them into roles for access grants.',
        }
      : null,
    permissions.canViewRoles
      ? {
          key: 'permissions',
          href: applicationHref('/application/permissions', applicationId, mode ? { mode } : undefined),
          title: 'Permissions',
          description: 'Create and manage permission definitions for this application.',
        }
      : null,
    permissions.canViewRoles
      ? {
          key: 'requests',
          href: applicationHref('/application/requests', applicationId, mode ? { mode } : undefined),
          title: 'Requests',
          description: 'Review role assignment requests waiting for approval.',
        }
      : null,
    permissions.canViewApplicationAccess
      ? {
          key: 'access',
          href: `/access/application?application=${applicationId}${modeSuffix}`,
          title: 'Access',
          description: 'View who owns and has access to this application.',
        }
      : null,
    logPermissions.canViewLogs
        ? {
          key: 'logs',
          href: `/data/activity?application=${applicationId}`,
          title: 'Application Logs',
          description: 'View activity and change history for this application.',
        }
      : null,
    logPermissions.canViewDevLogs
        ? {
          key: 'dev-logs',
          href: applicationHref('/application/logs', applicationId, mode ? { mode } : undefined),
          title: 'Development API Logs',
          description: 'Inspect request and response logs captured while app status is development.',
        }
      : null,
  ].filter((card): card is { key: string; href: string; title: string; description: string } => card !== null);

  return (
    <div className="grid gap-6">
      <div>
        <Button type="plain" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={mode === 'root' ? '/application?mode=root' : '/application'}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

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
                <Badge type="outlined">Internal</Badge>
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

      {permissions.canViewUsers ? (
        <Card>
          <CardContent className="grid divide-y p-0 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
            {[
              { label: 'Total Users', value: userStats?.total ?? 0, description: 'All connected accounts', icon: Users },
              { label: 'Last 24 Hours', value: userStats?.last24h ?? 0, description: 'New connections today', icon: UserPlus, activeSince: '1d' },
              { label: 'Last 7 Days', value: userStats?.lastWeek ?? 0, description: 'New connections this week', icon: UserPlus, activeSince: '7d' },
              { label: 'Last 30 Days', value: userStats?.lastMonth ?? 0, description: 'New connections this month', icon: UserPlus, activeSince: '30d' },
            ].map(({ label, value, description, icon: StatIcon, activeSince }) => (
              <FlowLink
                key={label}
                href={applicationHref('/application/users', applicationId, {
                  ...(mode ? { mode } : {}),
                  activeSince,
                })}
                className="group p-6 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium">{label}</h3>
                  <StatIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </FlowLink>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {managementCards.length > 0 ? (
        <div className="grid gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Manage Application</h2>
          <div className="overflow-hidden rounded-2xl border bg-card">
            {managementCards.map((card, index) => (
              <FlowLink
                key={card.key}
                href={card.href}
                className={`group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5 ${
                  index < managementCards.length - 1 ? 'border-b' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium">{card.title}</p>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>
            ))}
          </div>
        </div>
      ) : null}

      {permissions.canDeleteApplication && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>Delete this application.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteAction}>
              <Button htmlType="submit" type="solid" convey="danger">
                Delete Application
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
