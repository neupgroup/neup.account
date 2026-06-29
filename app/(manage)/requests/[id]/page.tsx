import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRequestDetail } from '@/services/manage/requests/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';
import { RequestActionForm } from './form';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { formatRoleScopeForDisplay } from '@/services/role-scopes';

type Props = { params: Promise<{ id: string }> };

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:  'secondary',
  approved: 'default',
  denied:   'destructive',
  rejected: 'destructive',
  revoked:  'destructive',
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

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

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
      const fieldLabel = (field: string) =>
        field
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/_/g, ' ')
          .toLowerCase();
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <DetailRow label="Submitted by" value={request.submittedBy} />
            <DetailRow label="Application ID" value={String(d.appId ?? '')} />
            <DetailRow label="Requested Name" value={String(requestedData.name ?? '')} />
            <DetailRow label="Submitted" value={request.submittedAt} />
          </div>
          {changes.length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-sm font-medium">Requested Changes</p>
              {changes.map((c) => (
                <Card key={c.field}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Requested change of {fieldLabel(c.field)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                      From "{c.oldValue ?? ''}" to "{c.newValue ?? ''}"
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'applicationRoleRequest': {
      const roles = Array.isArray(d.roles)
        ? d.roles as Array<{ id?: string; name?: string; scope?: unknown }>
        : [];
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <DetailRow label="Application" value={String(d.appName ?? d.appId ?? '')} />
            <DetailRow label="Application ID" value={String(d.appId ?? '')} />
            <DetailRow label="Account ID" value={String(d.accountId ?? '')} />
            <DetailRow label="Connection ID" value={String(d.connectionId ?? '')} />
            <DetailRow label="Assignment" value={String(d.assignmentKind ?? '')} />
            <DetailRow label="Submitted" value={request.submittedAt} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Requested Roles</p>
            <div className="grid gap-2">
              {roles.length > 0 ? roles.map((role) => (
                <Card key={role.id ?? role.name}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="text-sm font-medium">{role.name ?? role.id}</p>
                      <p className="text-xs text-muted-foreground">{role.id}</p>
                    </div>
                    {role.scope ? <Badge variant="outline">{formatRoleScopeForDisplay(role.scope)}</Badge> : null}
                  </CardContent>
                </Card>
              )) : (
                <p className="text-sm text-muted-foreground">No role details were stored.</p>
              )}
            </div>
          </div>
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
  const showTakeAction = isPending || ['approved', 'cancelled', 'denied', 'rejected'].includes(request.status);
  const isApplicationChange = request.type === 'applicationChange';
  const appId = isApplicationChange ? String(request.data.appId ?? '') : '';
  const appRequestedData =
    isApplicationChange && request.data.requestedData && typeof request.data.requestedData === 'object'
      ? (request.data.requestedData as Record<string, unknown>)
      : {};
  const appName = isApplicationChange
    ? String(request.data.appName ?? appRequestedData.name ?? appId)
    : '';
  const requestedScope = isApplicationChange ? String(request.data.requestedScope ?? 'configuration') : '';
  const humanSubmittedAt = formatHumanReadableTimestamp(request.submittedAt);

  return (
    <div className="grid gap-6">
      <BackButton href="/requests" />

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">{request.typeLabel}</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isApplicationChange && appId ? (
                <>
                  <Link
                    href={applicationHref('/application', appId, { mode: 'root' })}
                    className="no-underline hover:underline underline-offset-4"
                  >
                    {appName}
                  </Link>{' '}
                  requested change of their {requestedScope}.
                </>
              ) : (
                request.summary
              )}
            </h1>
            <p className="text-muted-foreground">
              Submitted by {request.submittedBy}{humanSubmittedAt ? ` ${humanSubmittedAt}` : ''}.
            </p>
          </div>
          <Badge
            variant={statusVariant[request.status] ?? 'outline'}
            className="capitalize"
          >
            {request.status}
          </Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Requested Changes</h2>
        <RequestDetailBody request={request} />
      </section>

      {showTakeAction ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Take Action</h3>
          {isPending ? (
            <RequestActionForm request={request} />
          ) : ['denied', 'cancelled', 'rejected'].includes(request.status) ? (
            <RequestActionForm request={request} />
          ) : (
            <Alert>
              <Terminal className="h-4 w-4" />
              <AlertTitle>Already processed</AlertTitle>
              <AlertDescription>
                This request has already been <strong>{request.status}</strong>.
              </AlertDescription>
            </Alert>
          )}
        </section>
      ) : null}
    </div>
  );
}
