import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { BackButton } from '#/components/ui/back-button';
import { PrimaryHeader } from '#/components/ui/primary-header';
import { Card, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { FlowLink } from '#/components/ui/flow-link';
import {
  canCurrentAccountClearApplicationDevLogs,
  clearApplicationDevLogs,
  getApplicationDetailsForViewerV2,
  getApplicationDevLogsPaginated,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';
import { LogsAccordion } from './logs-accordion';

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

  if (applicationId) notFound();
  notFound();
}

export async function ApplicationLogsPage({
  applicationId,
  searchParams,
}: {
  applicationId: string;
  searchParams: {
    page?: string;
    pageSize?: string;
    mode?: string;
  };
}) {
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
  const page = normalizePositiveInt(searchParams.page, DEFAULT_PAGE);
  const pageSize = normalizePageSize(searchParams.pageSize);
  const mode = searchParams.mode?.trim();

  const canonical = new URLSearchParams();
  if (mode) canonical.set('mode', mode);
  canonical.set('page', String(page));
  canonical.set('pageSize', String(pageSize));

  const isCanonical =
    (searchParams.page ?? '') === String(page) &&
    (searchParams.pageSize ?? '') === String(pageSize);

  if (!isCanonical) {
    redirect(applicationHref('/application/logs', applicationId, Object.fromEntries(canonical.entries())));
  }

  const details = await getApplicationDetailsForViewerV2(applicationId, { rootMode: mode === 'root' });
  if (!details) notFound();
  if (mode === 'root') await logRootApplicationActivity(applicationId, 'logs');
  const canClearDevLogs = await canCurrentAccountClearApplicationDevLogs(applicationId, { rootMode: mode === 'root' });

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
          <p className="text-sm text-muted-foreground">
            Showing {(logPage.page - 1) * logPage.pageSize + 1}-
            {Math.min(logPage.page * logPage.pageSize, logPage.total)} of {logPage.total}
          </p>

          <LogsAccordion logs={logs} />
        </div>
      )}

      {logs.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex justify-start">
            {canClearDevLogs ? (
              <form action={clearLogsAction}>
                <Button type="submit" variant="destructive">
                  Clear All Logs
                </Button>
              </form>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
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
      ) : null}
    </div>
  );
}
