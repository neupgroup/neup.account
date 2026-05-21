'use client';

import { FlowLink } from '@/components/ui/flow-link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useState, useEffect, useTransition, Suspense } from 'react';
import NProgress from 'nprogress';

import { useToast } from '@/core/hooks/use-toast';
import { submitNeupId, submitPassword, submitPasswordWithNeupId } from '@/services/auth/signin';
import { getSignupStepData } from '@/services/auth/signup';
import { cancelAccountDeletion } from '@/services/data/delete';
import { handleAuthRequest } from '@/app/auth/handleAuthRequest';
import { verifyTotpFromPost } from '@/services/auth/totp';
import { redirectInApp } from '@/core/helpers/link';
import { appendAuthCallbackContext, appendRedirect, hasAuthCallbackContext, shouldReturnToAuthStartForExternalAuthentication, getFlowParams, appendFlowParams } from '@/core/auth/callback';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from '@/components/icons';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// --- Components ---

const SIGNIN_TIMEOUT_DESCRIPTION = 'Exceeded the time for SignIn.';

function isExpiredSessionError(error?: string) {
  return Boolean(error && (error.includes('Exceeded the time for SignIn.') || error.includes('Your session has expired. Please try again.')));
}

function NeupIdStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [neupId, setNeupId] = useState('');
  const [isCheckingNeupId, startNeupIdCheck] = useTransition();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);

  const redirects = searchParams.get('redirects');

  useEffect(() => {
    const initFlow = async () => {
      const currentId = sessionStorage.getItem('AuthSessionRequest');
      try {
        if (currentId) {
          setAuthRequestId(currentId);
          const { data } = await getSignupStepData(currentId);
          if (data?.neupId) {
            setNeupId(data.neupId);
          }
        } else {
          const { requestId: nextId } = await handleAuthRequest({
            flowType: 'signin',
            clearSessionKeys: ['temp_user_info'],
            forceNew: true,
          });
          setAuthRequestId(nextId);

          const { data } = await getSignupStepData(nextId);
          if (data?.neupId) {
            setNeupId(data.neupId);
          }
        }
      } catch (error) {
        console.error("Failed to initialize auth flow", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to initialize session. Please refresh.' });
        return;
      }
      
      const neupIdParam = searchParams.get('neupId');
      if (neupIdParam) {
          setNeupId(neupIdParam);
      }
    };
    initFlow();
  }, [router, toast, searchParams]);

  const handleNeupIdSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    const currentId = authRequestId || sessionStorage.getItem('AuthSessionRequest');

    if (!currentId) {
      toast({ title: 'Please wait...', description: 'Initializing secure session.' });
      return;
    }

    NProgress.start();
    startNeupIdCheck(async () => {
      const result = await submitNeupId({ neupId, authRequestId: currentId });
      if (result.success) {
        if (result.userInfo) {
          sessionStorage.setItem('temp_user_info', JSON.stringify(result.userInfo));
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', 'password');
        params.delete('neupId');
        redirectInApp(`/auth/signin?${params.toString()}`, router);
      } else {
        if (isExpiredSessionError(result.error)) {
          try {
            const { requestId: newId } = await handleAuthRequest({
              flowType: 'signin',
              clearSessionKeys: ['temp_user_info'],
              forceNew: true,
            });
            setAuthRequestId(newId);
          } catch (error) {
            console.error('Failed to refresh signin session:', error);
          }
          setValidationError(SIGNIN_TIMEOUT_DESCRIPTION);
        } else {
          setValidationError(result.error || 'Invalid NeupID.');
        }
        NProgress.done();
      }
    });
  };

  const handleNeupIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNeupId(value);
    if (validationError) setValidationError(null);
  };

  const getSignupUrl = () => {
    const params = new URLSearchParams();
    params.set('step', 'name');
    let withContext = appendAuthCallbackContext(`/auth/signup?${params.toString()}`, searchParams);
    withContext = appendRedirect(withContext, redirects);
    withContext = appendFlowParams(withContext, searchParams);
    return withContext;
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <div className="flex justify-start items-center mb-4"></div>
          <CardTitle className="text-2xl font-headline">Sign in with Neup.Account</CardTitle>
          <CardDescription>
            Sign in with your NeupID to access NeupID Group Products and Services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNeupIdSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="neupId">NeupID</Label>
              <div className="relative">
                <Input
                  id="neupId"
                  name="neupId"
                  type="text"
                  placeholder="neupid"
                  required
                  autoFocus
                  value={neupId}
                  onChange={handleNeupIdChange}
                  autoComplete="username"
                  className="pr-10"
                  disabled={isCheckingNeupId}
                />
                {isCheckingNeupId && (
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {validationError && (
                <p className="text-sm text-destructive">{validationError}</p>
              )}
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isCheckingNeupId}>
              {isCheckingNeupId ? <Loader2 className="animate-spin" /> : 'Next'}
            </Button>
            <div className="mt-4 text-left text-sm">
              Don&apos;t have an Account?{' '}
              <FlowLink href={getSignupUrl()} className="underline text-primary">
                <span>Sign Up</span>
              </FlowLink>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [neupId, setNeupId] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, startPasswordSubmit] = useTransition();
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);
  const neupIdFromUrl = (searchParams.get('neupId') || '').trim().toLowerCase();

  const [showDeletionDialog, setShowDeletionDialog] = useState(false);

  const redirects = searchParams.get('redirects');
  const forgetUrl = appendRedirect(appendAuthCallbackContext('/auth/forget', searchParams), redirects);

  useEffect(() => {
    let isMounted = true;

    const setupPasswordStep = async () => {
      // If neupId is in the URL, we skip pre-validation and show the password form directly.
      // Account existence is only revealed at password submission time.
      if (neupIdFromUrl) {
        if (isMounted) setNeupId(neupIdFromUrl);
        const currentRequestId = sessionStorage.getItem('AuthSessionRequest');
        if (currentRequestId) {
          if (isMounted) setAuthRequestId(currentRequestId);
          return;
        }
        const { requestId: nextRequestId } = await handleAuthRequest({
          flowType: 'signin',
          clearSessionKeys: ['temp_user_info'],
          forceNew: true,
        });
        if (isMounted) setAuthRequestId(nextRequestId);
        return;
      }

      const currentRequestId = sessionStorage.getItem('AuthSessionRequest');
      if (currentRequestId) {
        if (isMounted) setAuthRequestId(currentRequestId);
        const savedUserInfo = sessionStorage.getItem('temp_user_info');
        if (savedUserInfo) {
          try {
            const parsed = JSON.parse(savedUserInfo);
            if (parsed.neupId && isMounted) setNeupId(parsed.neupId);
          } catch { /* ignore */ }
        }

        const { data } = await getSignupStepData(currentRequestId);
        if (data?.neupId && isMounted) setNeupId(data.neupId);
        return;
      }

      const { requestId: nextRequestId } = await handleAuthRequest({
        flowType: 'signin',
        clearSessionKeys: ['temp_user_info'],
        forceNew: true,
      });

      if (!nextRequestId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', 'neupid');
        redirectInApp(`/auth/signin?${params.toString()}`, router);
        return;
      }

      if (isMounted) setAuthRequestId(nextRequestId);

      const savedUserInfo = sessionStorage.getItem('temp_user_info');
      if (savedUserInfo) {
        try {
          const parsed = JSON.parse(savedUserInfo);
          if (parsed.neupId && isMounted) setNeupId(parsed.neupId);
        } catch { /* ignore */ }
      }

      const { data } = await getSignupStepData(nextRequestId);
      if (data?.neupId && isMounted) {
        setNeupId(data.neupId);
      } else if (!savedUserInfo) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', 'neupid');
        redirectInApp(`/auth/signin?${params.toString()}`, router);
      }
    };

    setupPasswordStep();
    return () => { isMounted = false; };
  }, [router, searchParams, toast, neupIdFromUrl]);

  const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authRequestId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Session not found. Please try again.' });
      return;
    }
    NProgress.start();
    startPasswordSubmit(async () => {
      let result = neupIdFromUrl
        ? await submitPasswordWithNeupId({ neupId: neupIdFromUrl, password, authRequestId })
        : await submitPassword({ password, authRequestId });

      if (!result.success && isExpiredSessionError(result.error)) {
        try {
          const { requestId: refreshedId } = await handleAuthRequest({
            flowType: 'signin',
            clearSessionKeys: ['temp_user_info'],
            forceNew: true,
          });
          setAuthRequestId(refreshedId);

          if (neupIdFromUrl) {
            result = await submitPasswordWithNeupId({ neupId: neupIdFromUrl, password, authRequestId: refreshedId });
          } else {
            const neupIdResult = await submitNeupId({ neupId, authRequestId: refreshedId });
            if (!neupIdResult.success) {
              toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNIN_TIMEOUT_DESCRIPTION });
              const params = new URLSearchParams(searchParams.toString());
              params.set('step', 'neupid');
              redirectInApp(`/auth/signin?${params.toString()}`, router);
              return;
            }
            result = await submitPassword({ password, authRequestId: refreshedId });
          }
        } catch (error) {
          console.error('Failed to refresh signin session:', error);
          toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNIN_TIMEOUT_DESCRIPTION });
          NProgress.done();
          return;
        }
      }

      if (result.success) {
        if (result.isPendingDeletion) {
          setShowDeletionDialog(true);
          NProgress.done();
        } else if (result.mfaRequired) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('step', 'mfa');
          redirectInApp(`/auth/signin?${params.toString()}`, router);
        } else {
          sessionStorage.clear();

          // Check if backsTo exists - if so, use that as the redirect
          const flowParams = getFlowParams(searchParams);
          if (flowParams.backsTo) {
            redirectInApp(flowParams.backsTo, null, { hard: true });
            return;
          }

          if (shouldReturnToAuthStartForExternalAuthentication(searchParams)) {
            redirectInApp(appendAuthCallbackContext('/auth/start', searchParams), null, { hard: true });
            return;
          }

          if (redirects) {
            redirectInApp(redirects, null, { hard: true });
            return;
          }

          if (hasAuthCallbackContext(searchParams)) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('step');
            params.delete('neupId');
            params.set('step', 'access');
            redirectInApp(`/auth/sign?${params.toString()}`, null, { hard: true });
            return;
          }

          redirectInApp('/', null, { hard: true });
        }
      } else {
        toast({
          variant: 'destructive',
          title: isExpiredSessionError(result.error) ? 'Timeout Error' : 'Sign In Failed',
          description: isExpiredSessionError(result.error) ? SIGNIN_TIMEOUT_DESCRIPTION : result.error,
        });
        NProgress.done();
      }
    });
  };

  const handleCancelDeletion = async () => {
    setShowDeletionDialog(false);
    if (!authRequestId) return;
    NProgress.start();
    startPasswordSubmit(async () => {
      const { data } = await getSignupStepData(authRequestId);
      if (!data?.accountId) {
        toast({ variant: "destructive", title: "Error", description: "Could not find account to cancel deletion." });
        NProgress.done();
        return;
      }

      const result = await cancelAccountDeletion(data.accountId);
      if (result.success) {
        toast({ title: "Deletion Cancelled", description: "Your account deletion request has been cancelled. Welcome back!", className: "bg-accent text-accent-foreground" });
        const loginResult = await submitPassword({ password, authRequestId });
        if (loginResult.success && !loginResult.isPendingDeletion) {
          if (loginResult.mfaRequired) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'mfa');
            redirectInApp(`/auth/signin?${params.toString()}`, router);
          }
          else {
            sessionStorage.clear();
            redirectInApp(redirects || '/manage', router);
          }
        } else {
          toast({ variant: "destructive", title: "Sign In Failed", description: loginResult.error });
          NProgress.done();
        }
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Could not cancel deletion." });
        NProgress.done();
      }
    });
  };

  const handleProceedWithDeletion = () => {
    setShowDeletionDialog(false);
    redirectInApp('/auth/start', router);
  };

  const handleBack = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', 'neupid');
    redirectInApp(`/auth/signin?${params.toString()}`, router);
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Welcome back,</CardTitle>
          <CardDescription>
            @{neupId}, enter your password and you're a step closer to getting into your NeupID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="password-form" onSubmit={handlePasswordSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Sign In'}
            </Button>
            <div className="flex justify-between items-center text-sm">
              <FlowLink href={forgetUrl} className="underline text-primary">
                Forget Password
              </FlowLink>
              <Button variant="link" type="button" onClick={handleBack} className="text-primary p-0 h-auto" disabled={isSubmitting}>
                Back
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showDeletionDialog} onOpenChange={setShowDeletionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account Deletion Pending</AlertDialogTitle>
            <AlertDialogDescription>
              Your account is scheduled for deletion. Continuing to sign in will cancel this request. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleProceedWithDeletion}>Log Out</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelDeletion} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Cancel Deletion & Sign In'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MfaStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [isSubmitting, startSubmit] = useTransition();
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);

  const redirects = searchParams.get('redirects');

  useEffect(() => {
    const id = sessionStorage.getItem('AuthSessionRequest');
    if (!id) {
      redirectInApp('/auth/signin', router);
      return;
    }
    setAuthRequestId(id);
  }, [router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authRequestId) return;
    NProgress.start();
    startSubmit(async () => {
      try {
        const result = await verifyTotpFromPost({ token, authRequestId });

        if (result.success) {
          sessionStorage.clear();

          // Check if backsTo exists - if so, use that as the redirect
          const flowParams = getFlowParams(searchParams);
          if (flowParams.backsTo) {
            redirectInApp(flowParams.backsTo, router);
            return;
          }

          if (shouldReturnToAuthStartForExternalAuthentication(searchParams)) {
            redirectInApp(appendAuthCallbackContext('/auth/start', searchParams), router);
            return;
          }

          if (redirects) {
            redirectInApp(redirects, router);
            return;
          }

          if (hasAuthCallbackContext(searchParams)) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('step');
            params.delete('neupId');
            params.set('step', 'access');
            redirectInApp(`/auth/sign?${params.toString()}`, router);
            return;
          }

          redirectInApp('/', router);
        } else {
          toast({
            variant: 'destructive',
            title: 'MFA Failed',
            description: result.error || 'An unexpected error occurred.',
          });
          NProgress.done();
        }
      } catch (error) {
        console.error('MFA error:', error);
        toast({
          variant: 'destructive',
          title: 'MFA Failed',
          description: 'An unexpected error occurred. Please try again.',
        });
        NProgress.done();
      }
    });
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Enter Authentication Code</CardTitle>
          <CardDescription>Open your authenticator app and enter the code to complete your login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="token">One-Time Password</Label>
              <Input
                id="token"
                name="token"
                type="text"
                placeholder="123456"
                required
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isSubmitting}
                autoComplete="one-time-code"
              />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Verify'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Page ---

function SigninFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = searchParams.get('step');
  const neupIdParam = (searchParams.get('neupId') || searchParams.get('neupid') || '').trim().toLowerCase();

  useEffect(() => {
    const startFlow = async () => {
      try {
        const { requestId } = await handleAuthRequest({
          flowType: 'signin',
          clearSessionKeys: ['temp_user_info'],
        });

        const params = new URLSearchParams(searchParams.toString());
        params.delete('neupid');

        // Deep-link support: /auth/signin?step=password&neupId=<id>
        // Register the neupId into the request and then clean it from URL/session.
        if (step === 'password' && neupIdParam) {
          const result = await submitNeupId({ neupId: neupIdParam, authRequestId: requestId });
          sessionStorage.removeItem('temp_user_info');

          if (result.success) {
            params.set('step', 'password');
            params.delete('neupId');
            redirectInApp(`/auth/signin?${params.toString()}`, router);
            return;
          }

          params.delete('neupId');
          params.set('step', 'neupid');
          redirectInApp(`/auth/signin?${params.toString()}`, router);
          return;
        }

        if (!step) {
          if (neupIdParam) {
            params.set('step', 'password');
          } else {
            params.set('step', 'neupid');
          }
          redirectInApp(`/auth/signin?${params.toString()}`, router);
          return;
        }
      } catch (error) {
        console.error('Failed to initialize signin flow:', error);
      }
    };

    void startFlow();
  }, [step, neupIdParam, router, searchParams]);

  if (!step) return null;

  switch (step) {
    case 'neupid': return <NeupIdStep />;
    case 'password': return <PasswordStep />;
    case 'mfa': return <MfaStep />;
    default: return <NeupIdStep />;
  }
}

export default function SigninPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SigninFlow />
    </Suspense>
  )
}
