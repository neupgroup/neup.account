export type QueryParamValue = string | string[] | undefined;

export function getQueryParam(value: QueryParamValue): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : undefined;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function applicationHref(
  pathname: string,
  applicationId: string,
  params?: Record<string, string | number | undefined | null>,
): string {
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
