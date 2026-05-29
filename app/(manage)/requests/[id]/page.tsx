import { notFound } from 'next/navigation';
import { getRequestDetail } from '@/services/manage/requests/all';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';
import { RequestActionForm } from './form';

type Props = { params: Promise<{ id: string }> };

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:  'secondary',
  approved: 'default',
  denied:   'destructive',
  rejected: 'destructive',
  revoked:  'destructive',
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function RequestDetailBody({ request }: { request: Awaited<ReturnType<typeof getRequestDetail>> }) {
  if (!request) return null;
  const d = request.data;

  switch (request.type) {
    case 'neupid_request':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="User" value={String(d.userFullName ?? request.submittedBy)} />
          <DetailRow label="Requested NeupID" value={String(d.requestedNeupId ?? d.requestedId ?? '')} />
          <DetailRow label="Submitted" value={request.submittedAt} />
          <div>
            <p className="text-xs text-muted-foreground">Current NeupIDs</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Array.isArray(d.currentNeupIds) && d.currentNeupIds.length > 0
                ? (d.currentNeupIds as string[]).map((id) => (
                    <Badge key={id} variant="outline" className="text-xs">{id}</Badge>
                  ))
                : <span className="text-sm text-muted-foreground">None</span>
              }
            </div>
          </div>
        </div>
      );

    case 'display_name_request':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="User" value={request.submittedBy} />
          <DetailRow label="Requested Display Name" value={String(d.requestedDisplayName ?? '')} />
          <DetailRow label="Submitted" value={request.submittedAt} />
        </div>
      );

    case 'kyc_request':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="User" value={request.submittedBy} />
          <DetailRow label="Document Type" value={String(d.documentType ?? '')} />
          <DetailRow label="Submitted" value={request.submittedAt} />
          {!!d.documentPhotoUrl && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Document Photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={String(d.documentPhotoUrl)} alt="Document" className="rounded-md max-h-48 object-contain border" />
            </div>
          )}
          {!!d.selfiePhotoUrl && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Selfie</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={String(d.selfiePhotoUrl)} alt="Selfie" className="rounded-md max-h-48 object-contain border" />
            </div>
          )}
        </div>
      );

    case 'kycVerification':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="Account" value={request.submittedBy} />
          <DetailRow label="Category" value={String(d.category ?? '')} />
          <DetailRow label="Reason" value={String(d.reason ?? '')} />
          <DetailRow label="Processed by" value={String(d.doneBy ?? '')} />
          <DetailRow label="Processed at" value={String(d.doneAt ?? '')} />
          <DetailRow label="Submitted" value={request.submittedAt} />
        </div>
      );

    case 'applicationChange': {
      const changes = Array.isArray(d.changes) ? d.changes as Array<{ field: string; oldValue: string | null; newValue: string | null }> : [];
      const requestedData = (d.requestedData ?? {}) as Record<string, unknown>;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <DetailRow label="Submitted by" value={request.submittedBy} />
            <DetailRow label="Application ID" value={String(d.appId ?? '')} />
            <DetailRow label="Requested Name" value={String(requestedData.name ?? '')} />
            <DetailRow label="Submitted" value={request.submittedAt} />
          </div>
          {changes.length > 0 && (
            <div className="rounded-md border divide-y mt-2">
              <div className="grid grid-cols-3 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                <span>Field</span><span>Current</span><span>Proposed</span>
              </div>
              {changes.map((c) => (
                <div key={c.field} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                  <span className="font-medium capitalize">{c.field}</span>
                  <span className="text-muted-foreground line-through truncate">{c.oldValue ?? <em>empty</em>}</span>
                  <span className="font-medium truncate">{c.newValue ?? <em className="text-muted-foreground">empty</em>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'accountDeletion':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <DetailRow label="Account" value={request.submittedBy} />
          <DetailRow label="Account ID" value={String(d.accountId ?? '')} />
        </div>
      );

    default:
      return (
        <pre className="text-xs bg-muted rounded-md p-4 overflow-auto">
          {JSON.stringify(d, null, 2)}
        </pre>
      );
  }
}

export default async function RequestDetailPage({ params }: Props) {
  const { id } = await params;
  const request = await getRequestDetail(id);

  if (!request) notFound();

  const isPending = request.status === 'pending';

  return (
    <div className="grid gap-6">
      <BackButton href="/requests" />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">{request.typeLabel}</Badge>
              </div>
              <CardTitle>{request.summary}</CardTitle>
              <CardDescription>
                Submitted by {request.submittedBy}{request.submittedAt ? ` on ${request.submittedAt}` : ''}.
              </CardDescription>
            </div>
            <Badge
              variant={statusVariant[request.status] ?? 'outline'}
              className="capitalize"
            >
              {request.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <RequestDetailBody request={request} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Take Action</CardTitle>
          <CardDescription>
            Approve to apply this request, deny to reject it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isPending ? (
            <Alert>
              <Terminal className="h-4 w-4" />
              <AlertTitle>Already processed</AlertTitle>
              <AlertDescription>
                This request has already been <strong>{request.status}</strong>. No further action can be taken.
              </AlertDescription>
            </Alert>
          ) : (
            <RequestActionForm request={request} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
