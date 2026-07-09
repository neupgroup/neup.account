'use client';

/*
::neup.documentation::applications-pill-view

Segmented application list for the `/application` route.

The component preserves the active application mode in generated links so
root-mode navigation stays in the root management context.

::end
*/

import { useRouter, useSearchParams } from 'next/navigation';
import { FlowLink } from '@/components/ui/flow-link';
import { Badge } from '@/components/ui/badge';
import { AppWindow, Building, BarChart, Share2, ChevronRight, Plus, type LucideIcon } from '@/components/icons';
import type { FlatAppItem, ApplicationSection } from '@/services/applications/types';
import { redirectInApp } from '@/core/helpers/navigation';
import {
  applicationHref,
  applicationOverviewTabs,
  type ApplicationOverviewTab,
} from '@/app/(manage)/application/_lib/query-param';

const TAB_PARAM: Record<ApplicationSection['label'], ApplicationOverviewTab> = {
  Using: 'using',
  Development: 'development',
  Root: 'root',
};

const PARAM_TO_LABEL: Record<string, ApplicationSection['label']> = {
  using: 'Using',
  development: 'Development',
  root: 'Root',
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

function AppRow({
  app,
  showStatus,
  mode,
}: {
  app: FlatAppItem;
  showStatus?: boolean;
  mode?: string;
}) {
  const Icon = iconFor(app.icon);
  return (
    <FlowLink
      href={applicationHref('/application', app.id, mode ? { mode } : undefined)}
      className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium leading-6">{app.name}</p>
          <p className="truncate text-sm text-muted-foreground font-mono">
            {app.slug ?? app.id}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {showStatus && app.status && (
          <Badge variant={statusVariant[app.status] ?? 'outline'} className="capitalize text-xs">
            {app.status}
          </Badge>
        )}
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </FlowLink>
  );
}

function CreateAppRow({ mode }: { mode?: string }) {
  return (
    <FlowLink
      href={mode ? `/application/add?mode=${encodeURIComponent(mode)}` : '/application/add'}
      className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 last:border-b-0 sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/20">
          <Plus className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium leading-6 text-muted-foreground">
            Create Application
          </p>
          <p className="truncate text-sm text-muted-foreground/80">
            Register a new app and configure it later.
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </FlowLink>
  );
}

const emptyMessage: Record<ApplicationSection['label'], string> = {
  Using: 'No connected applications yet.',
  Development: 'No applications found.',
  Root: 'No applications registered.',
};

const showCreateOn: ApplicationSection['label'][] = ['Development', 'Root'];

type Props = {
  sections: ApplicationSection[];
  canCreateApplication: boolean;
  initialTab?: ApplicationOverviewTab;
};

export function ApplicationsPillView({ sections, canCreateApplication, initialTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'root' ? 'root' : undefined;

  const tabParam = searchParams.get('tab');
  const resolvedTab =
    tabParam && applicationOverviewTabs.includes(tabParam as ApplicationOverviewTab)
      ? (tabParam as ApplicationOverviewTab)
      : initialTab ?? 'using';
  const activeLabel: ApplicationSection['label'] =
    PARAM_TO_LABEL[resolvedTab] ?? 'Using';

  // If the resolved label isn't in the available sections, fall back to the first one
  const active =
    sections.find((s) => s.label === activeLabel)?.label ??
    sections[0]?.label ??
    'Using';

  const setActive = (label: ApplicationSection['label']) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', TAB_PARAM[label]);
    redirectInApp(router, `?${params.toString()}`, { replace: true, scroll: false });
  };

  const currentSection = sections.find((s) => s.label === active);
  const showCreate = canCreateApplication && showCreateOn.includes(active);

  return (
    <div className="grid gap-6">
      {/* Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {sections.map((section) => {
          const isActive = section.label === active;
          return (
            <button
              key={section.label}
              type="button"
              onClick={() => setActive(section.label)}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      {/* Active section content */}
      {currentSection && (
        currentSection.error ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
              Could not load this section.
            </div>
          </div>
        ) : currentSection.apps.length === 0 && !showCreate ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
              {emptyMessage[currentSection.label]}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {showCreate && <CreateAppRow mode={mode} />}
            {currentSection.apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                mode={mode}
                showStatus={currentSection.label === 'Root'}
              />
            ))}
            {currentSection.apps.length === 0 && showCreate && (
              <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                {emptyMessage[currentSection.label]}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
