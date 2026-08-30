
"use client";

import { FlowLink } from '#/components/ui/flow-link';
import { useEffect, useTransition, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Label } from '#/components/ui/label';
import { Loader2 } from '@/components/icons';
import { useToast } from '#/core/hooks/useToast';
import { validateAuthSessionRequest } from '@/services/auth/auth-request';
import { handleAuthRequest } from '@/app/auth/handleAuthRequest';

const AUTH_SESSION_STORAGE_KEY = 'AuthSessionRequest';

export default function ForgetPage() {
  const [isPending, startTransition] = useTransition();
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    const initRequest = async () => {
      try {
        const { requestId } = await handleAuthRequest({
          flowType: 'forgot_password',
          storageKey: AUTH_SESSION_STORAGE_KEY,
        });
        if (isMounted) setAuthRequestId(requestId);
      } catch (error) {
        console.error('Failed to initialize forgot-password flow', error);
      }
    };

    initRequest();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const requestId = authRequestId || sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!requestId) {
        toast({ variant: 'destructive', title: 'Timeout Error', description: 'Exceeded the time for Forget Password.' });
        return;
      }

      const validation = await validateAuthSessionRequest(requestId, 'forgot_password');
      if (!validation.valid) {
        toast({ variant: 'destructive', title: 'Timeout Error', description: 'Exceeded the time for Forget Password.' });
        return;
      }

      // In a real application, you would call a server action here.
      // For this demo, we'll just simulate a network request.
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast({
        title: "Recovery Link Sent",
        description: "If an account exists for that email, a recovery link has been sent.",
      });
    });
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
      <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
        <CardHeader>
          <div className="flex justify-start items-center mb-4">

          </div>
          <CardTitle className="text-2xl font-headline">Forgot NeupID?</CardTitle>
          <CardDescription>
            Enter the email address associated with your account and we'll send you a link to recover your NeupID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="you@example.com" required disabled={isPending} autoComplete="email" />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isPending}>
              {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send Recovery Link'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Remembered your NeupID?{" "}
            <FlowLink href="/auth/signin?step=neupid" className="underline text-primary">
              Sign In
            </FlowLink>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
