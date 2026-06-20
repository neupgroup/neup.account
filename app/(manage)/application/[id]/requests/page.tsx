import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronRight } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FlowLink } from '@/components/ui/flow-link';
import { getApplicationDetailsForViewerV2 } from '@/services/applications/manage';
import { getAllRequests } from '@/services/manage/requests/all';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ id: string }>;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:  'secondary',
  approved: 'default',
  denied:   'destructive',
  rejected: 'destructive',
  revoked:  'destructive',
  active:   'default',
};

function formatHumanReadableTimestamp(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) return 'Recently';

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

export default async function ApplicationRequestsPage({ params }: Props) {
  const { id } = await params;
  const details = await getApplicationDetailsForViewerV2(id);
  if (!details) notFound();

  const requests = await getAllRequests({ type: 'applicationRoleRequest', application: id });

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={applicationHref('/application', id, { mode: 'root' })}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground">{details.name}</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No role requests found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {requests.map((request) => (
                <FlowLink
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {request.typeLabel}
                      </Badge>
                      <Badge variant={statusVariant[request.status] ?? 'outline'} className="text-xs capitalize">
                        {request.status}
                      </Badge>
                    </div>
                    <p className="truncate text-sm font-medium">{request.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatHumanReadableTimestamp(request.submittedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </FlowLink>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
