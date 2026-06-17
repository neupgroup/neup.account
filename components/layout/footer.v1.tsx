'use client';

import { usePathname } from 'next/navigation';

const MANAGE_PREFIXES = [
  '/access',
  '/data',
  '/home',
  '/manage',
  '/notifications',
  '/payment',
  '/people',
  '/profile',
  '/search',
  '/security',
];

export function FooterV1() {
  const pathname = usePathname();

  const isManageRoute =
    pathname === '/' ||
    MANAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (isManageRoute) {
    return null;
  }

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-4 text-xs text-muted-foreground lg:px-6">
        <span>Neup.Account</span>
        <span>Built by Neup Group</span>
      </div>
    </footer>
  );
}
