import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApplicationDetailsForViewerV2, getApplicationDevLogs } from '@/services/applications/manage';

type Props = { params: Promise<{ id: string }> };

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export default async function ApplicationLogsPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);
  if (!details) notFound();

  const logs = await getApplicationDevLogs(id, 200);
  if (logs === null) notFound();

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

