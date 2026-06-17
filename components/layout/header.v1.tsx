'use client';

import { NeupIdLogo } from '@/components/neupid-logo';
import { UserNav } from '@/components/user-nav';
import { usePathname } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';
import { Button } from '@/components/ui/button';
import { PanelLeft, X } from '@/components/icons';
import { cn } from '@/core/helpers/utils';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/core/providers/session';

const STATIC_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';

type HeaderV1Props = {
  showUserNavOnAuth?: boolean;
  logoUrl?: string;
};

function MobileHeaderProfileCard() {
  const { profile, loading, isManaging } = useSession();

  if (loading) {
    return (
      <div className="rounded-2xl border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage
            src={profile.accountPhoto || 'https://neupgroup.com/assets/user.png'}
            alt={profile.nameDisplay || ''}
            data-ai-hint="person logo"
          />
          <AvatarFallback />
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{profile.nameDisplay}</p>
          {profile.neupIdPrimary && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              @{profile.neupIdPrimary}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {isManaging ? 'Managing account' : 'Personal account'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HeaderV1({ showUserNavOnAuth = false, logoUrl }: HeaderV1Props) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthPath = pathname?.startsWith('/auth');
  const shouldShowUserNav = showUserNavOnAuth || !isAuthPath;
  const resolvedLogoUrl = logoUrl || STATIC_LOGO_URL;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background shadow-sm">
      <div className="relative mx-auto max-w-[1440px] bg-background">
        <div className="relative z-[52] flex h-16 items-center justify-between px-4 lg:px-6">
          <NeupIdLogo iconHref="https://neupgroup.com" textHref="/" logoUrl={resolvedLogoUrl} />
          {shouldShowUserNav ? (
            <>
              <div className="hidden lg:block">
                <UserNav />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
              </Button>
            </>
          ) : (
            <div className="h-9 w-9" aria-hidden="true" />
          )}
        </div>
      </div>
      {shouldShowUserNav && (
        <div
          className={cn(
            "fixed inset-x-0 top-16 z-[51] border-b bg-background lg:hidden",
            mobileMenuOpen ? "bottom-0" : "pointer-events-none bottom-auto h-0 overflow-hidden border-b-0"
          )}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="mx-auto flex h-full max-w-[1440px] flex-col px-4 pb-6 pt-4">
            <MobileHeaderProfileCard />
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-background p-3">
              <DashboardNav />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
