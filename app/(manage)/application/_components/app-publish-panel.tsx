'use client';

import { useTransition } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { requestAppPublication } from '@/services/applications/manage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle2, XCircle, Clock } from 'lucide-react';

type Props = {
  appId: string;
  currentStatus: string;
  publicationRequestStatus: 'none' | 'pending';
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  development: 'secondary',
  rejected: 'destructive',
  blocked: 'destructive',
};

const statusDescription: Record<string, string> = {
  development: 'Your application is in development and not yet visible to users.',
  active: 'Your application is live and accessible to users.',
  rejected: 'Your publication request was rejected. Review the log below for details, then resubmit.',
  blocked: 'Your application has been blocked by an administrator.',
};

export function AppPublishPanel({ appId, currentStatus, publicationRequestStatus }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleRequestPublication = () => {
    startTransition(async () => {
      const result = await requestAppPublication(appId);
      if (result.success) {
        toast({ title: 'Request submitted', description: 'Your publication request is pending review.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  const canRequest =
    (currentStatus === 'development' || currentStatus === 'rejected') &&
    publicationRequestStatus === 'none';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Publication Status</CardTitle>
            <CardDescription className="mt-1">
              {statusDescription[currentStatus] ?? 'Unknown status.'}
            </CardDescription>
          </div>
          <Badge variant={statusVariant[currentStatus] ?? 'outline'} className="capitalize text-sm px-3 py-1">
            {currentStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {currentStatus === 'active' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Live</AlertTitle>
            <AlertDescription>
              Your application is published and accessible. Contact an administrator to make status changes.
            </AlertDescription>
          </Alert>
        )}

        {currentStatus === 'blocked' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Blocked</AlertTitle>
            <AlertDescription>
              This application has been blocked. Contact an administrator for more information.
            </AlertDescription>
          </Alert>
        )}

        {publicationRequestStatus === 'pending' && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Pending review</AlertTitle>
            <AlertDescription>
              Your publication request has been submitted and is awaiting administrator approval.
            </AlertDescription>
          </Alert>
        )}

        {canRequest && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Submit a request to publish your application. An administrator will review and approve or reject it.
            </p>
            <Button onClick={handleRequestPublication} disabled={isPending}>
              {isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                : <><Send className="mr-2 h-4 w-4" />Request Publication</>
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
