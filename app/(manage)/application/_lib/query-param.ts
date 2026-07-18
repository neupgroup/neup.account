/*
::neup.documentation::application-query-param-helpers

Helpers for normalizing `/application` query parameters.

The application area reserves `mode=root` for server-side root-management
access and uses a dedicated `tab` query parameter for client-side overview
section selection.

::end
*/

export type QueryParamValue = string | string[] | undefined;

export const applicationOverviewTabs = ['using', 'development', 'root'] as const;

export type ApplicationOverviewTab = (typeof applicationOverviewTabs)[number];

export function getQueryParam(value: QueryParamValue): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : undefined;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getApplicationMode(value: string | undefined): 'root' | undefined {
  return value?.trim() === 'root' ? 'root' : undefined;
}

export function getApplicationOverviewTab(
  tabValue: string | undefined,
  legacyModeValue?: string,
): ApplicationOverviewTab | undefined {
  const normalizedTab = tabValue?.trim();
  if (normalizedTab && applicationOverviewTabs.includes(normalizedTab as ApplicationOverviewTab)) {
    return normalizedTab as ApplicationOverviewTab;
  }

  const normalizedLegacyMode = legacyModeValue?.trim();
  if (
    normalizedLegacyMode
    && normalizedLegacyMode !== 'root'
    && applicationOverviewTabs.includes(normalizedLegacyMode as ApplicationOverviewTab)
  ) {
    return normalizedLegacyMode as ApplicationOverviewTab;
  }

  return normalizedLegacyMode === 'root' ? 'root' : undefined;
}

export function applicationHref(
  pathname: string,
  applicationId: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const canonicalApplicationPath = pathname === '/application'
    ? `/application/${encodeURIComponent(applicationId)}`
    : pathname.startsWith('/application/')
      ? `/application/${encodeURIComponent(applicationId)}${pathname.slice('/application'.length)}`
      : null;

  if (canonicalApplicationPath) {
    const searchParams = new URLSearchParams();

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        searchParams.set(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `${canonicalApplicationPath}?${query}` : canonicalApplicationPath;
  }

  const searchParams = new URLSearchParams();
  searchParams.set('application', applicationId);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      searchParams.set(key, String(value));
    }
  }

  return `${pathname}?${searchParams.toString()}`;
}
