import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLink } from '@/components/ui/flow-link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  getApplicationDetailsForViewerV2,
  getApplicationRoleOptions,
  getApplicationUserConnectionDetails,
} from '@/services/applications/manage';
import { RoleSelector } from './_components/role-selector';

type Props = {
  params: Promise<{ id: string; connId: string }>;
};

function statusVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'deactivated') return 'destructive';
  return 'outline';
}

function statusLabel(status: string | null): string {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function ApplicationUserDetailsPage({ params }: Props) {
  const { id: appId, connId } = await params;

  const [application, details] = await Promise.all([
    getApplicationDetailsForViewerV2(appId),
    getApplicationUserConnectionDetails({ appId, connectionId: connId }),
  ]);

  if (!application || !details) notFound();
  const roles = await getApplicationRoleOptions(appId, details.accountType);

  const initials = details.displayName?.charAt(0).toUpperCase() ?? '?';

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={`/application/${appId}/users?mode=root`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Details</h1>
        <p className="text-muted-foreground">{application.name}</p>
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

      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">Role Management</h2>
          <p className="text-sm text-muted-foreground">Search and assign the appropriate role for this user connection.</p>
        </div>
        <RoleSelector
          appId={appId}
          connectionId={connId}
          roles={roles}
          currentRoleId={details.roleId}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <FlowLink
          href={`/application/${appId}/users/${connId}/delete?mode=root`}
          className="group flex items-center justify-between gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
        >
          <div className="min-w-0">
            <p className="font-medium">Delete Account</p>
            <p className="text-sm text-muted-foreground">Remove this account from the application.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </FlowLink>

        <FlowLink
          href={`/application/${appId}/users/${connId}/activity?mode=root`}
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
