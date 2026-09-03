'use client';

import { NeupIdLogo } from '@/components/neupid-logo';
import { Userbar } from '#/components/element/userbar';
import { usePathname, useSearchParams } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';
import { Button } from '#/components/ui/button';
import { Menu, X } from '@/components/icons';
import { cn } from '#/core/utils';
import { useEffect, useState } from 'react';
import { useSession } from '@/inapp/auth/session-context';

const STATIC_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';
const HEADER_HEIGHT = '4rem';
const MOBILE_EXPAND_DURATION = 700;
const MOBILE_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

type HeaderV1Props = {
  showUserNavOnAuth?: boolean;
  logoUrl?: string;
};

export function HeaderV1({ showUserNavOnAuth = false, logoUrl }: HeaderV1Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile } = useSession();
  const isAuthPath = pathname?.startsWith('/auth');
  const shouldShowUserNav = showUserNavOnAuth || !isAuthPath;
  const resolvedLogoUrl = logoUrl || STATIC_LOGO_URL;
  const workingProfile = searchParams.get('workingProfile')?.trim();
  const homeHref = workingProfile ? `/home?workingProfile=${encodeURIComponent(workingProfile)}` : '/home';

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
      className="fixed inset-x-0 top-0 z-50 bg-background shadow-[0_6px_18px_rgba(15,23,42,0.12)] lg:h-16"
      style={{
        height: mobileMenuOpen && shouldShowUserNav ? '100dvh' : HEADER_HEIGHT,
        transition: `height ${MOBILE_EXPAND_DURATION}ms ${MOBILE_EXPAND_EASING}`,
      }}
    >
      <div className="mx-auto h-full max-w-[1440px] bg-background">
        <div
          className={cn(
            'flex h-full flex-col overflow-hidden bg-background',
            mobileMenuOpen && 'shadow-[0_6px_18px_rgba(15,23,42,0.12)]'
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
            <NeupIdLogo iconHref={homeHref} textHref={homeHref} logoUrl={resolvedLogoUrl} />
            {shouldShowUserNav ? (
              <>
                <div className="hidden lg:block">
                  <Userbar displayName={profile?.nameDisplay || ''} displayImage={profile?.accountPhoto} neupid={profile?.neupIdPrimary || ''} />
                </div>
                <Button
                  htmlType="button"
                  variant="outlined"
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
                <Userbar displayName={profile?.nameDisplay || ''} displayImage={profile?.accountPhoto} neupid={profile?.neupIdPrimary || ''} />
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
