import { notFound, redirect } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlowLink } from '@/components/ui/flow-link';
import { getApplicationDetailsForViewerV2, getApplicationDevLogsPaginated } from '@/services/applications/manage';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; mode?: string }>;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function normalizePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizePageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  if (parsed < MIN_PAGE_SIZE || parsed > MAX_PAGE_SIZE) return 10;
  return parsed;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export default async function ApplicationLogsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const page = normalizePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = normalizePageSize(query.pageSize);
  const mode = query.mode?.trim();

  const canonical = new URLSearchParams();
  if (mode) canonical.set('mode', mode);
  canonical.set('page', String(page));
  canonical.set('pageSize', String(pageSize));

  const isCanonical =
    (query.page ?? '') === String(page) &&
    (query.pageSize ?? '') === String(pageSize);

  if (!isCanonical) {
    redirect(`/application/${id}/logs?${canonical.toString()}`);
  }

  const details = await getApplicationDetailsForViewerV2(id);
  if (!details) notFound();

  const logPage = await getApplicationDevLogsPaginated({ appId: id, page, pageSize });
  if (logPage === null) notFound();
  const logs = logPage.logs;

  return (
    <div className="grid gap-6">
      <div className="space-y-4">
        <BackButton href={`/application/${id}`} />
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
                <FlowLink href={`/application/${id}/logs?${new URLSearchParams({ ...(mode ? { mode } : {}), page: String(logPage.page - 1), pageSize: String(logPage.pageSize) }).toString()}`}>
                  Previous
                </FlowLink>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {logPage.page} of {logPage.totalPages}
              </span>
              <Button variant="outline" size="sm" asChild disabled={logPage.page >= logPage.totalPages}>
                <FlowLink href={`/application/${id}/logs?${new URLSearchParams({ ...(mode ? { mode } : {}), page: String(logPage.page + 1), pageSize: String(logPage.pageSize) }).toString()}`}>
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
    </div>
  );
}
