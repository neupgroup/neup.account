import { Suspense } from 'react';
import { checkPermissions } from '@/services/user';
import { getAllRequests } from '@/services/manage/requests/all';
import { REQUEST_TYPE_LABELS } from '@/services/manage/requests/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ban, ChevronRight } from '@/components/icons';
import { FlowLink } from '@/components/ui/flow-link';
import Link from 'next/link';
import { cn } from '@/neup.core/helpers/utils';
import { permission } from '@/neup.logica/permission';

type Props = {
  searchParams: Promise<{ type?: string; application?: string }>;
};

const pagePermissions = [
  permission('requests.root_approval.view', 'for_individual', 'page'),
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:  'secondary',
  approved: 'default',
  denied:   'destructive',
  rejected: 'destructive',
  revoked:  'destructive',
  active:   'default',
};

const TYPE_FILTERS = [
  { label: 'All',                key: undefined },
  { label: 'NeupID',             key: 'neupid_request' },
  { label: 'Display Name',       key: 'display_name_request' },
  { label: 'KYC',                key: 'kyc_request' },
  { label: 'KYC Verification',   key: 'kycVerification' },
  { label: 'App Changes',        key: 'applicationChange' },
  { label: 'App Roles',          key: 'applicationRoleRequest' },
  { label: 'Account Deletion',   key: 'accountDeletion' },
];

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

async function RequestsList({ type, application }: { type?: string; application?: string }) {
  const canView = await checkPermissions(['requests.root_approval.view']);

  if (!canView) {
    return (
      <Alert variant="destructive">
        <Ban className="h-4 w-4" />
        <AlertTitle>Permission Denied</AlertTitle>
        <AlertDescription>You do not have permission to view requests.</AlertDescription>
      </Alert>
    );
  }

  const requests = await getAllRequests({ type, application });

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground text-sm">
          No requests found{type ? ` for type "${REQUEST_TYPE_LABELS[type] ?? type}"` : ''}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {requests.map((req) => (
            <FlowLink
              key={req.id}
              href={`/requests/${req.id}`}
              className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {req.typeLabel}
                  </Badge>
                  <Badge
                    variant={statusVariant[req.status] ?? 'outline'}
                    className="capitalize text-xs shrink-0"
                  >
                    {req.status}
                  </Badge>
                </div>
                <p className="text-sm font-medium truncate">{req.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {formatHumanReadableTimestamp(req.submittedAt)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </FlowLink>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function RequestsPage({ searchParams }: Props) {
  const { type, application } = await searchParams;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground">
          All requests across every type — pending and processed.
        </p>
      </div>

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((filter) => {
          const isActive = filter.key === type || (!filter.key && !type);
          const href = filter.key
            ? `/requests?type=${filter.key}${application ? `&application=${application}` : ''}`
            : `/requests${application ? `?application=${application}` : ''}`;
          return (
            <Link
              key={filter.label}
              href={href}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm">
              Loading...
            </CardContent>
          </Card>
        }
      >
        <RequestsList type={type} application={application} />
      </Suspense>
    </div>
  );
}
