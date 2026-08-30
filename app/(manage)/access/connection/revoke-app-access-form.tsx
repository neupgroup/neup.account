'use client';

import { useTransition } from 'react';
import { Button } from '#/components/ui/button';
import { Loader2, X } from '@/components/icons';
import { revokeAppAccessFromAccount } from './actions';

export function RevokeAppAccessButton({
  appId,
  memberId,
  displayName,
}: {
  appId: string;
  memberId: string;
  displayName: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleRevoke = () => {
    startTransition(async () => {
      await revokeAppAccessFromAccount({ appId, memberId });
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={`Revoke access for ${displayName}`}
      onClick={handleRevoke}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
