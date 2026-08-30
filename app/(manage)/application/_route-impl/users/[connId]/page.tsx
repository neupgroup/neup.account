import { forbidden, notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight } from '@/components/icons';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card';
import { FlowLink } from '#/components/ui/flow-link';
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar';
import {
  canCurrentAccountRemoveApplicationUser,
  canCurrentAccountUpdateApplicationUserRole,
  canCurrentAccountUseRootApplicationMode,
  canCurrentAccountViewApplicationUsers,
  getApplicationDetailsForViewerV2,
  getApplicationUserConnectionDetails,
  logRootApplicationActivity,
} from '@/services/applications/manage';
import {
  ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
  ROOT_APPLICATION_USER_VIEW_PERMISSION,
} from '@/services/applications/permission-definitions';
import { applicationHref, getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ connId: string }>;
  searchParams: Promise<{
    application?: string | string[];
    mode?: string;
    query?: string;
    role?: string;
    status?: string;
    activeSince?: string;
    sort?: string;
  }>;
};

export default async function ApplicationUserDetailsQueryPage({ params, searchParams }: Props) {
  const { connId } = await params;
  const { application } = await searchParams;
  const appId = getQueryParam(application);

  if (appId) notFound();
  notFound();
}

export async function ApplicationUserDetailsPage({
  appId,
  connId,
  mode,
  query,
  role,
  status,
  activeSince,
  sort,
}: {
  appId: string;
  connId: string;
  mode?: string;
  query?: string;
  role?: string;
  status?: string;
  activeSince?: string;
  sort?: string;
}) {
  if (
    mode === 'root' &&
    !(await canCurrentAccountUseRootApplicationMode([
      ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION,
      ROOT_APPLICATION_USER_VIEW_PERMISSION,
    ]))
  ) {
    forbidden();
  }

  const [applicationDetails, details] = await Promise.all([
    getApplicationDetailsForViewerV2(appId, {
      rootMode: mode === 'root',
      rootPermissionNames: [ROOT_APPLICATION_ACCOUNT_VIEW_PERMISSION, ROOT_APPLICATION_USER_VIEW_PERMISSION],
    }),
    getApplicationUserConnectionDetails({ appId, connectionId: connId, rootMode: mode === 'root' }),
  ]);

  if (!applicationDetails || !details) notFound();
  if (mode === 'root') await logRootApplicationActivity(appId, `users/${connId}`);
  const [canViewUsers, canUpdateUserRole, canRemoveUser] = await Promise.all([
    canCurrentAccountViewApplicationUsers(appId, { rootMode: mode === 'root' }),
    canCurrentAccountUpdateApplicationUserRole(appId, { rootMode: mode === 'root' }),
    canCurrentAccountRemoveApplicationUser(appId, { rootMode: mode === 'root' }),
  ]);
  if (!canViewUsers) forbidden();

  const initials = details.displayName?.charAt(0).toUpperCase() ?? '?';
  const statusVariant = (status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (status === 'active') return 'default';
    if (status === 'deactivated') return 'destructive';
    return 'outline';
  };
  const statusLabel = (status: string | null): string => {
    if (!status) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink
            href={applicationHref('/application/users', appId, {
              mode,
              query,
              role,
              status,
              activeSince,
              sort,
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Details</h1>
        <p className="text-muted-foreground">{applicationDetails.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-md shrink-0">
              <AvatarImage src={details.displayImage ?? undefined} alt={details.displayName ?? ''} />
              <AvatarFallback className="rounded-md text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{details.displayName || 'Unnamed Account'}</p>
                {details.isVerified ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> : null}
              </div>
              <p className="text-xs text-muted-foreground">{details.accountType}</p>
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Account ID</p>
              <p className="font-mono text-xs break-all">{details.accountId}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Connection ID</p>
              <p className="font-mono text-xs break-all">{details.connectionId}</p>
            </div>
            <div>
              <p className="text-muted-foreground">NEUP ID</p>
              <p>{details.neupId || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Connected At</p>
              <p>{new Date(details.connectedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Connection Status</p>
              <Badge variant={statusVariant(details.connectionStatus)} className="capitalize">
                {statusLabel(details.connectionStatus)}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Account Status</p>
              <Badge variant={statusVariant(details.accountStatus)} className="capitalize">
                {statusLabel(details.accountStatus)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {canUpdateUserRole ? (
          <FlowLink
            href={applicationHref(`/application/users/${details.connectionId}/roles`, appId, mode ? { mode } : undefined)}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Role Management</p>
              <p className="text-sm text-muted-foreground">Toggle public, root, and approval-based roles for this user connection.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>
        ) : null}

        {canRemoveUser ? (
          <FlowLink
            href={applicationHref(`/application/users/${details.connectionId}/delete`, appId, mode ? { mode } : undefined)}
            className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
          >
            <div className="min-w-0">
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">Remove this account from the application.</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </FlowLink>
        ) : null}

        <FlowLink
          href={applicationHref(`/application/users/${details.connectionId}/activity`, appId, mode ? { mode } : undefined)}
          className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
        >
          <div className="min-w-0">
            <p className="font-medium">Activity</p>
            <p className="text-sm text-muted-foreground">Review recent activity of this user in the application.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </FlowLink>
      </div>
    </div>
  );
}
