
'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from './ui/skeleton';
import { useSession } from '@/core/providers/session';

export function UserNav() {
  const { profile, loading } = useSession();

  if (loading || !profile) {
    return (
        <div className="flex items-center gap-2">
            <div className="text-right">
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
        </div>
    )
  }

  return (
    <div className="relative h-8 flex items-center justify-end gap-2 p-0">
      <div className="text-right">
        <p className="text-sm font-medium">{profile.nameDisplay}</p>
        {profile.neupIdPrimary && (
          <p className="text-xs text-muted-foreground font-mono">@{profile.neupIdPrimary}</p>
        )}
      </div>
      <Avatar className="h-9 w-9">
        <AvatarImage src={profile.accountPhoto || "https://neupgroup.com/assets/user.png"} alt={profile.nameDisplay || ''} data-ai-hint="person logo" />
        <AvatarFallback />
      </Avatar>
    </div>
  );
}
