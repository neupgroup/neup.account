'use client';

import { NeupIdLogo } from '@/components/neupid-logo';
import { UserNav } from '@/components/user-nav';
import { usePathname } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';
import { Button } from '@/components/ui/button';
import { Menu, X } from '@/components/icons';
import { cn } from '@/core/helpers/utils';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/core/providers/session';

const STATIC_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';
const HEADER_HEIGHT = '4rem';
const MOBILE_EXPAND_DURATION = 700;
const MOBILE_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

type HeaderV1Props = {
  showUserNavOnAuth?: boolean;
  logoUrl?: string;
};

function MobileHeaderProfileCard() {
  const { profile, loading, isManaging } = useSession();

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background p-4">
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
    <div className="rounded-2xl border border-border/60 bg-background p-4">
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
          <p className="truncate text-sm font-semibold text-slate-950">{profile.nameDisplay}</p>
          {profile.neupIdPrimary && (
            <p className="truncate font-mono text-xs text-slate-500">@{profile.neupIdPrimary}</p>
          )}
          <p className="text-xs text-slate-500">
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
    <header
      className="fixed inset-x-0 top-0 z-50 bg-background shadow-sm lg:h-16"
      style={{
        height: mobileMenuOpen && shouldShowUserNav ? '100dvh' : HEADER_HEIGHT,
        transition: `height ${MOBILE_EXPAND_DURATION}ms ${MOBILE_EXPAND_EASING}`,
      }}
    >
      <div className="mx-auto h-full max-w-[1440px] bg-background">
        <div
          className={cn(
            'flex h-full flex-col overflow-hidden bg-background',
            mobileMenuOpen && 'shadow-sm'
          )}
          style={{
            transition: `box-shadow ${MOBILE_EXPAND_DURATION}ms ${MOBILE_EXPAND_EASING}, background-color ${MOBILE_EXPAND_DURATION}ms ${MOBILE_EXPAND_EASING}`,
          }}
        >
          <div
            className={cn(
              'flex h-14 min-h-14 items-center justify-between px-4 sm:px-5 lg:h-16 lg:min-h-16 lg:px-6',
              mobileMenuOpen && shouldShowUserNav && 'border-b'
            )}
          >
            <NeupIdLogo iconHref="https://neupgroup.com" textHref="/" logoUrl={resolvedLogoUrl} />
            {shouldShowUserNav ? (
              <>
                <div className="hidden lg:block">
                  <UserNav />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-10 w-10 border-transparent bg-background text-slate-900 shadow-none hover:bg-accent/50 lg:hidden',
                    mobileMenuOpen && 'bg-accent/40'
                  )}
                  aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={mobileMenuOpen}
                  onClick={() => setMobileMenuOpen((open) => !open)}
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </>
            ) : (
              <div className="h-10 w-10" aria-hidden="true" />
            )}
          </div>

          {shouldShowUserNav && (
            <div className="min-h-0 flex-1 lg:hidden">
              <div
                className={cn(
                  'mx-4 h-px bg-border',
                  mobileMenuOpen ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-90'
                )}
                style={{
                  transformOrigin: 'center',
                  transition: `opacity 260ms ease ${mobileMenuOpen ? 180 : 0}ms, transform 700ms ${MOBILE_EXPAND_EASING}`,
                }}
              />

              <div
                className="flex h-full min-h-0 flex-col px-4 pb-4 pt-4"
                style={{
                  opacity: mobileMenuOpen ? 1 : 0,
                  transform: mobileMenuOpen ? 'translateY(0)' : 'translateY(-18px)',
                  transition: `opacity 360ms ease ${mobileMenuOpen ? 220 : 0}ms, transform 700ms ${MOBILE_EXPAND_EASING}`,
                  pointerEvents: mobileMenuOpen ? 'auto' : 'none',
                }}
                aria-hidden={!mobileMenuOpen}
              >
                <MobileHeaderProfileCard />
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border/60 bg-background p-3">
                  <DashboardNav />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
