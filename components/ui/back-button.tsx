
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/core/utils';
import { resolveBackNavigationHref, type NavigationBackTargets } from '@/core/helpers/link/navigation';
import { Suspense } from 'react';

type BackButtonProps = {
  backsTo?: string;
  href?: string;
  className?: string;
  navigationTargets?: NavigationBackTargets;
};

function BackButtonInner({ backsTo, href, className, navigationTargets }: BackButtonProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const urlBacksTo = searchParams.get('backsTo');
  const targetHref = resolveBackNavigationHref({
    backsTo: urlBacksTo ?? backsTo ?? href,
    currentPathname: pathname || '/',
    currentSearch: search ? `?${search}` : '',
    currentHash: typeof window === 'undefined' ? '' : window.location.hash,
    targets: navigationTargets,
  });

  return (
    <a
      href={targetHref}
      className={cn("flex items-center gap-2 text-sm font-bold text-foreground hover:underline underline-offset-4", className)}
      onClick={(event) => {
        event.preventDefault();
        window.location.assign(targetHref);
      }}
    >
        <ChevronLeft className="h-4 w-4" />
        Go back
    </a>
  );
}

export function BackButton(props: BackButtonProps) {
  return (
    <Suspense
      fallback={(
        <a
          href={props.backsTo ?? props.href ?? '/account'}
          className={cn("flex items-center gap-2 text-sm font-bold text-foreground hover:underline underline-offset-4", props.className)}
        >
          <ChevronLeft className="h-4 w-4" />
          Go back
        </a>
      )}
    >
      <BackButtonInner {...props} />
    </Suspense>
  );
}
