'use client';

import { NeupIdLogo } from '@/components/neupid-logo';
import { UserNav } from '@/components/user-nav';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const STATIC_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';

type HeaderV1Props = {
  showUserNavOnAuth?: boolean;
  logoUrl?: string;
};

export function HeaderV1({ showUserNavOnAuth = false, logoUrl }: HeaderV1Props) {
  const pathname = usePathname();
  const isAuthPath = pathname?.startsWith('/auth');
  const shouldShowUserNav = showUserNavOnAuth || !isAuthPath;
  const initialLogoUrl = logoUrl || STATIC_LOGO_URL;
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(initialLogoUrl);

  useEffect(() => {
    let cancelled = false;

    const loadConfiguredLogo = async () => {
      try {
        const response = await fetch('/api/site/logo', { method: 'GET', cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as { logoUrl?: string | null };
        const nextLogoUrl = payload?.logoUrl;
        if (!nextLogoUrl || nextLogoUrl === initialLogoUrl) return;

        const image = new Image();
        image.onload = () => {
          if (!cancelled) setResolvedLogoUrl(nextLogoUrl);
        };
        image.src = nextLogoUrl;
      } catch {
        // Keep static logo when config is missing/unavailable.
      }
    };

    loadConfiguredLogo();
    return () => {
      cancelled = true;
    };
  }, [initialLogoUrl]);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center border-b bg-background shadow-sm">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 lg:px-6">
        <NeupIdLogo iconHref="https://neupgroup.com" textHref="/" logoUrl={resolvedLogoUrl} />
        {shouldShowUserNav ? <UserNav /> : <div className="h-9 w-9" aria-hidden="true" />}
      </div>
    </header>
  );
}
