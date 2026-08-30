'use client';

import { FlowLink } from '#/components/ui/flow-link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { ChevronRight, AlertTriangle, Loader2 } from '@/components/icons';
import { useEffect, useRef, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import React from 'react';
import { useToast } from '#/core/hooks/useToast';
import { AccountListItem } from '@/components/elements/account-item';
import type { StoredAccount } from '@/services/account/session';
import { appendAuthCallbackContext, appendRedirect, getAppDisplayName, shouldReturnToAuthStartForExternalAuthentication } from '@/inapp/auth/callbacks';
import { cleanupExpiredStoredSessions } from '@/services/account/session';
import { logoutStoredSession, removeStoredAccount } from '@/services/account/startSessions';

// Inline sign-out / remove actions rendered next to each account on the start page.
export function AccountActions({ account }: { account: StoredAccount }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const { toast } = useToast();

    if (account.isUnknown) return null;
    if (account.sid === '') return null;

    const handleSignOut = () => {
        startTransition(async () => {
            if (!account.sid) return;
            const result = await logoutStoredSession(account.sid);
            if (result.success) {
                toast({ title: 'Session Expired', description: 'You have been signed out of this account.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
            router.refresh();
        });
    };

    const handleRemove = () => {
        startTransition(async () => {
            const result = await removeStoredAccount(account.aid);
            if (result.success) {
                toast({ title: 'Account Removed', description: 'The account has been removed from this device.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
            router.refresh();
        });
    };

    return (
        <div data-action-button="true">
            <span className="text-muted-foreground">&bull;</span>
            {!account.sid ? (
                <Button variant="link" size="sm" onClick={handleRemove} disabled={isPending} className="p-0 h-auto ml-2 text-destructive">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                </Button>
            ) : (
                <Button variant="link" size="sm" onClick={handleSignOut} disabled={isPending} className="p-0 h-auto ml-2 text-muted-foreground hover:text-foreground">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Out'}
                </Button>
            )}
        </div>
    );
}

interface StartPageComponentProps {
  accounts: StoredAccount[];
  hasActiveSession: boolean;
  appName?: string | null;
  firstPartyAppRedirectUrl?: string | null;
}

function isSafeRedirectTarget(target: string) {
  if (!target) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target) || target.startsWith('//')) return false;
  return target.startsWith('/') || target.startsWith('?');
}

export function StartPageComponent({ accounts, hasActiveSession, appName, firstPartyAppRedirectUrl }: StartPageComponentProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const redirects = searchParams.get('redirects');
  const visibleAccounts = accounts.filter((account) => Boolean(account.aid) && !account.isUnknown && !account.guest);
  const activeAccount = visibleAccounts.find((account) => account.def === 1);

  useEffect(() => {
    // Run cleanup at most once per browser session to avoid DB calls on every visit.
    const CLEANUP_KEY = 'auth_cleanup_done';
    if (typeof window !== 'undefined' && !sessionStorage.getItem(CLEANUP_KEY)) {
      sessionStorage.setItem(CLEANUP_KEY, '1');
      void cleanupExpiredStoredSessions();
    }
  }, []);

  useEffect(() => {
    if (error === 'inactivity' && !hasActiveSession) {
      toastRef.current({
        variant: 'default',
        title: 'Signed Out',
        description: 'Signed Out because of Inactivity',
        className: 'bg-yellow-500 text-white border-none',
      });
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, hasActiveSession]);

  const getUrlWithReturn = (baseUrl: string) => {
    const withContext = appendAuthCallbackContext(baseUrl, searchParams);
    return appendRedirect(withContext, redirects);
  };

  const getContinueUrl = () => {
    if (redirects && isSafeRedirectTarget(redirects)) {
      return redirects;
    }

    if (shouldReturnToAuthStartForExternalAuthentication(searchParams)) {
      return appendAuthCallbackContext('/auth/sign', searchParams);
    }

    return '/home';
  };

  const displayAppName = getAppDisplayName(appName);
  const showSignedInChoices = hasActiveSession && Boolean(activeAccount);
  const showError = Boolean(error) && !(hasActiveSession && error === 'inactivity');

  return (
    <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <div className="flex justify-start items-center mb-4">

          </div>
          <CardTitle className="text-2xl font-headline">Get Started</CardTitle>
          <CardDescription>
            {appName ? `Continue to ${displayAppName} with your NeupID.` : 'Choose an option below to continue with NeupID.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {showError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>
                  {errorDescription || 'An unknown error occurred. Please try signing in again.'}
                </AlertDescription>
              </Alert>
            )}

            {showSignedInChoices ? (
              <div className="space-y-2">
                <AccountListItem
                  account={activeAccount!}
                  isActive
                  interactive={false}
                  showActions={false}
                  showChevron={false}
                />

                {firstPartyAppRedirectUrl ? (
                  <a
                    href={firstPartyAppRedirectUrl}
                    className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <h3 className="font-semibold">Continue</h3>
                      <p className="text-sm text-muted-foreground">
                        {appName ? `Continue to ${displayAppName} with this account.` : 'Continue with this account.'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </a>
                ) : (
                  <FlowLink
                    href={getContinueUrl()}
                    className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <h3 className="font-semibold">Continue</h3>
                      <p className="text-sm text-muted-foreground">
                        {appName ? `Continue to ${displayAppName} with this account.` : 'Continue with this account.'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </FlowLink>
                )}

                <FlowLink
                  href={getUrlWithReturn("/auth/signin?step=neupid")}
                  className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold">Continue with other account</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign in with a different NeupID.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </FlowLink>
              </div>
            ) : (
              <>
                {visibleAccounts.length > 0 && (
                  <div className="space-y-2">
                    {visibleAccounts.map((acc) => (
                      <AccountListItem
                        key={acc.aid}
                        account={acc}
                        isActive={acc.def === 1}
                      />
                    ))}
                  </div>
                )}

                <FlowLink
                  href={getUrlWithReturn("/auth/signin?step=neupid")}
                  className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold">Sign In</h3>
                    <p className="text-sm text-muted-foreground">Sign in with NeupID and continue using NeupID Group Products and Services.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </FlowLink>
                <FlowLink
                  href={getUrlWithReturn("/auth/signup?step=name")}
                  className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold">Sign Up</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign up for a NeupID to use NeupID Group Products and Services.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </FlowLink>
                <FlowLink
                  href={getUrlWithReturn('/auth/forget')}
                  className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold">Forget NeupID</h3>
                    <p className="text-sm text-muted-foreground">
                      Can't remember your NeupID? We can help you recover your ID.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </FlowLink>
              </>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
