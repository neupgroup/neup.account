import { getConnectedApplicationsPageData } from '@/services/applications/form-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from '@/components/icons';
import { FlowLink } from '@/components/ui/flow-link';
import { AppWindow, Building, BarChart, Share2, ChevronRight, type LucideIcon } from '@/components/icons';

function iconFor(appIcon?: string): LucideIcon {
  const map: Record<string, LucideIcon> = {
    'app-window': AppWindow,
    building: Building,
    'bar-chart': BarChart,
    'share-2': Share2,
  };
  return appIcon ? (map[appIcon] || AppWindow) : AppWindow;
}

export default async function ApplicationsPage() {
  const { apps, error } = await getConnectedApplicationsPageData();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Connections</h1>
        <p className="text-muted-foreground">
          Applications you have connected to your account.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>
            Could not load your connected applications. Please try again.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        {apps.length === 0 && !error ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            No connected applications yet.
          </div>
        ) : (
          apps.map((app) => {
            const Icon = iconFor(app.icon);
            const connectedAt = app.connectedAt
              ? new Date(app.connectedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : null;
            return (
              <FlowLink
                key={app.id}
                href={`/data/appconnection/${app.id}`}
                className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium leading-6">{app.name}</p>
                    {connectedAt && (
                      <p className="truncate text-sm text-muted-foreground">
                        Connected {connectedAt}
                      </p>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </FlowLink>
            );
          })
        )}
      </div>
    </div>
  );
}
