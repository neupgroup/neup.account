'use client';

import { APP_NAME, formatAppTitle } from '@/neup.core/metadata';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

function getText(selector: string) {
  return document.querySelector<HTMLElement>(selector)?.textContent?.trim() || '';
}

function resolveTitle(pathname: string, searchParams: URLSearchParams) {
  const type = searchParams.get('type');
  const accountId = searchParams.get('account');
  const portfolioId = searchParams.get('portfolio');
  const applicationId = searchParams.get('application');

  if (pathname === '/manage') {
    return formatAppTitle('Accounts Management');
  }

  if (pathname === '/manage/cleanup') {
    return formatAppTitle('Accounts Cleanup');
  }

  if (pathname === '/home') {
    return formatAppTitle('Homepage');
  }

  if (pathname === '/site/config') {
    return formatAppTitle('Site Configuration');
  }

  if (pathname === '/access') {
    if (portfolioId) {
      const portfolioName = getText('main h2');
      return formatAppTitle('Access', portfolioName ? `${portfolioName} Portfolio` : 'Portfolio');
    }

    if (accountId) {
      return formatAppTitle('Access', `${accountId}'s Account`);
    }

    return formatAppTitle('Access & Control');
  }

  if (pathname === '/access/team') {
    return formatAppTitle('Team Management');
  }

  if (pathname === '/access/connection') {
    return formatAppTitle('Connection Management');
  }

  if (pathname === '/access/application') {
    return formatAppTitle('Application Management');
  }

  if (pathname === '/access/link') {
    return formatAppTitle('Link Other Accounts');
  }

  if (pathname === '/access/link/whatsapp') {
    return formatAppTitle('Link WhatsApp');
  }

  if (pathname === '/access/createAccount') {
    if (type === 'brand' || type === 'dependent' || type === 'subbrand') {
      return formatAppTitle('Create Account');
    }
  }

  if (pathname === '/access/family') {
    return formatAppTitle('Family Management');
  }

  if (pathname === '/access/invitations') {
    return formatAppTitle('Invitations');
  }

  if (pathname === '/access/blocked') {
    return formatAppTitle('Restrictions & Blocks');
  }

  if (pathname === '/application') {
    if (applicationId) {
      const applicationName = getText('main h1');
      return formatAppTitle(applicationName ? `${applicationName}'s Management` : 'Application Management');
    }

    return formatAppTitle('Application Management');
  }

  if (pathname === '/application/users') {
    if (applicationId) {
      const applicationName = getText('main p.text-muted-foreground');
      return formatAppTitle('Users', applicationName ? `${applicationName} Management` : 'Application Management');
    }

    return formatAppTitle('Users', 'Application Management');
  }

  const heading = getText('main h1');
  return heading && heading !== APP_NAME ? formatAppTitle(heading) : APP_NAME;
}

export function AppTitleSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const updateTitle = () => {
      document.title = resolveTitle(pathname, searchParams);
    };

    updateTitle();

    const observer = new MutationObserver(() => updateTitle());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [pathname, searchParams]);

  return null;
}
