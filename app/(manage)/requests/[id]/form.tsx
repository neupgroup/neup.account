'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { redirectInApp } from '@/core/helper/navigation';
import type { UnifiedRequest } from '@/services/manage/requests/types';

// Per-type server actions
import { approveNeupIdRequest, denyNeupIdRequest } from '@/services/manage/requests/neupid';
import { processDisplayNameRequest } from '@/services/manage/requests/display-name';
import { approveKycRequest, rejectKycRequest } from '@/services/manage/requests/kyc';
import { grantVerification, revokeVerification } from '@/services/manage/verifications';
import { approveAccountDeletion, cancelAccountDeletion } from '@/services/manage/requests/deletion';
import { approveApplicationChangeRequest, denyApplicationChangeRequest } from '@/services/applications/change-requests';
import { reissueRequestWithRemarks } from '@/services/manage/requests/reissue';

type Props = { request: UnifiedRequest };

export function RequestActionForm({ request }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remarks, setRemarks] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const done = (success: boolean, message: string) => {
    if (success) {
      toast({ title: 'Done', description: message });
      redirectInApp(router, '/requests');
      router.refresh();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: message });
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    const d = request.data;

    switch (request.type) {
      case 'neupid_request': {
        const result = await approveNeupIdRequest(
          request.id,
          String(d.accountId ?? ''),
          String(d.requestedNeupId ?? d.requestedId ?? ''),
        );
        done(result.success, result.error ?? 'NeupID request approved.');
        break;
      }
      case 'display_name_request': {
        const result = await processDisplayNameRequest(
          request.id,
          String(d.accountId ?? ''),
          String(d.requestedDisplayName ?? ''),
          true,
        );
        done(result.success, result.error ?? 'Display name approved.');
        break;
      }
      case 'kyc_request': {
        const result = await approveKycRequest(request.id, String(d.accountId ?? ''));
        done(result.success, result.error ?? 'KYC approved.');
        break;
      }
      case 'kycVerification': {
        const result = await grantVerification(String(d.accountId ?? ''), {
          reason: String(d.reason ?? 'Approved by admin.'),
          category: String(d.category ?? 'Standard'),
        });
        done(result.success, result.error ?? 'Verification granted.');
        break;
      }
      case 'applicationChange': {
        const result = await approveApplicationChangeRequest(request.id);
        done(result.success, result.error ?? 'Application changes applied.');
        break;
      }
      case 'accountDeletion': {
        const result = await approveAccountDeletion(String(d.accountId ?? ''));
        done(result.success, result.error ?? 'Account deleted.');
        break;
      }
      default:
        done(false, `No approve handler for type "${request.type}".`);
    }
  };

  const handleDeny = async () => {
    setIsSubmitting(true);
    const d = request.data;

    switch (request.type) {
      case 'neupid_request': {
        const result = await denyNeupIdRequest(request.id);
        done(result.success, result.error ?? 'NeupID request denied.');
        break;
      }
      case 'display_name_request': {
        const result = await processDisplayNameRequest(
          request.id,
          String(d.accountId ?? ''),
          String(d.requestedDisplayName ?? ''),
          false,
        );
        done(result.success, result.error ?? 'Display name request rejected.');
        break;
      }
      case 'kyc_request': {
        const result = await rejectKycRequest(
          request.id,
          String(d.accountId ?? ''),
          'Rejected by admin.',
        );
        done(result.success, result.error ?? 'KYC rejected.');
        break;
      }
      case 'kycVerification': {
        const result = await revokeVerification(
          String(d.accountId ?? ''),
          'Revoked by admin.',
        );
        done(result.success, result.error ?? 'Verification revoked.');
        break;
      }
      case 'applicationChange': {
        const result = await denyApplicationChangeRequest(request.id);
        done(result.success, result.error ?? 'Application change request denied.');
        break;
      }
      case 'accountDeletion': {
        const result = await cancelAccountDeletion(String(d.accountId ?? ''));
        done(result.success, result.error ?? 'Deletion request cancelled.');
        break;
      }
      default:
        done(false, `No deny handler for type "${request.type}".`);
    }
  };

  const handleReissue = async () => {
    setIsSubmitting(true);
    const result = await reissueRequestWithRemarks({ requestId: request.id, remarks });
    done(result.success, result.error ?? 'Request reissued.');
  };

  if (request.status !== 'pending') {
    const canReissue = ['denied', 'cancelled', 'rejected'].includes(request.status);
    if (!canReissue) return null;
    return (
      <div className="space-y-3">
        <Textarea
          placeholder="Write remarks for reissuing this request..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={isSubmitting}
        />
        <Button onClick={handleReissue} disabled={isSubmitting || remarks.trim().length < 5}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reissue Request
        </Button>
      </div>
    );
  }

  const denyLabel = request.type === 'accountDeletion' ? 'Cancel Request' : 'Deny';
  const denyDescription =
    request.type === 'accountDeletion'
      ? 'This will cancel the deletion request and reactivate the account.'
      : 'This will reject the request. The change will not be applied.';
  const approveDescription =
    request.type === 'accountDeletion'
      ? 'This will permanently delete the account and all associated data. This cannot be undone.'
      : 'This will approve and apply the request immediately.';

  return (
    <div className="flex gap-3">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this request?</AlertDialogTitle>
            <AlertDialogDescription>{approveDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={request.type === 'accountDeletion' ? 'outline' : 'destructive'} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {denyLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{denyLabel}?</AlertDialogTitle>
            <AlertDialogDescription>{denyDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeny}
              disabled={isSubmitting}
              className={
                request.type === 'accountDeletion'
                  ? undefined
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              }
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
