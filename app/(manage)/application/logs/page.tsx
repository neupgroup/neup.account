import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlowLink } from '@/components/ui/flow-link';
import {
  canCurrentAccountClearApplicationDevLogs,
  clearApplicationDevLogs,
  getApplicationDetailsForViewerV2,
  getApplicationDevLogsPaginated,
} from '@/services/applications/manage';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  searchParams: Promise<{
    application?: string | string[];
    page?: string;
    pageSize?: string;
    mode?: string;
  }>;
};

export default async function ApplicationLogsQueryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const applicationId = getQueryParam(resolvedSearchParams.application);

  if (!applicationId) notFound();
  const DEFAULT_PAGE = 1;
  const DEFAULT_PAGE_SIZE = 20;
  const MIN_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 50;
  const normalizePositiveInt = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
  };
  const normalizePageSize = (value: string | undefined): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
    if (parsed < MIN_PAGE_SIZE || parsed > MAX_PAGE_SIZE) return 10;
    return parsed;
  };
  const pretty = (value: unknown): string => {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value);
    }
  };

  const page = normalizePositiveInt(resolvedSearchParams.page, DEFAULT_PAGE);
  const pageSize = normalizePageSize(resolvedSearchParams.pageSize);
  const mode = resolvedSearchParams.mode?.trim();

  const canonical = new URLSearchParams();
  if (mode) canonical.set('mode', mode);
  canonical.set('page', String(page));
  canonical.set('pageSize', String(pageSize));

  const isCanonical =
    (resolvedSearchParams.page ?? '') === String(page) &&
    (resolvedSearchParams.pageSize ?? '') === String(pageSize);

  if (!isCanonical) {
    redirect(applicationHref('/application/logs', applicationId, Object.fromEntries(canonical.entries())));
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  const canClearDevLogs = await canCurrentAccountClearApplicationDevLogs(applicationId);

  const logPage = await getApplicationDevLogsPaginated({ appId: applicationId, page, pageSize });
  if (logPage === null) notFound();
  const logs = logPage.logs;
  const clearLogsAction = async () => {
    'use server';
    await clearApplicationDevLogs(applicationId);
  };

  return (
    <div className="grid gap-6">
      <div className="space-y-4">
        <BackButton href={applicationHref('/application', applicationId, mode ? { mode } : undefined)} />
        <PrimaryHeader
          title="Development Logs"
          description={`Request/response debug logs for ${details.name}. Logs are captured only while app status is development.`}
        />
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No logs yet</CardTitle>
            <CardDescription>Make requests to bridge APIs while status is development to capture logs.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(logPage.page - 1) * logPage.pageSize + 1}-
              {Math.min(logPage.page * logPage.pageSize, logPage.total)} of {logPage.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild disabled={logPage.page <= 1}>
                <FlowLink href={applicationHref('/application/logs', applicationId, { ...(mode ? { mode } : {}), page: String(logPage.page - 1), pageSize: String(logPage.pageSize) })}>
                  Previous
                </FlowLink>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {logPage.page} of {logPage.totalPages}
              </span>
              <Button variant="outline" size="sm" asChild disabled={logPage.page >= logPage.totalPages}>
                <FlowLink href={applicationHref('/application/logs', applicationId, { ...(mode ? { mode } : {}), page: String(logPage.page + 1), pageSize: String(logPage.pageSize) })}>
                  Next
                </FlowLink>
              </Button>
            </div>
          </div>

          {logs.map((log) => (
            <Card key={log.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{log.method} {log.endpoint}</CardTitle>
                  <Badge variant={log.statusCode >= 400 ? 'destructive' : 'secondary'}>{log.statusCode}</Badge>
                </div>
                <CardDescription>
                  {new Date(log.createdAt).toLocaleString()} | IP: {log.requesterIp ?? 'N/A'} | Origin: {log.origin ?? 'N/A'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-1">
                  <p><span className="font-medium">Referer:</span> {log.referer ?? 'N/A'}</p>
                  <p><span className="font-medium">User-Agent:</span> {log.userAgent ?? 'N/A'}</p>
                  {log.error ? <p className="text-destructive"><span className="font-medium">Error:</span> {log.error}</p> : null}
                </div>

                <details>
                  <summary className="cursor-pointer font-medium">Request Body</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">{pretty(log.requestBody)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer font-medium">Query</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">{pretty(log.query)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer font-medium">Request Meta</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">{pretty(log.requestMeta)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer font-medium">Response Body</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">{pretty(log.responseBody)}</pre>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canClearDevLogs ? (
        <div className="flex justify-start">
          <form action={clearLogsAction}>
            <Button type="submit" variant="destructive">
              Clear All Logs
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
