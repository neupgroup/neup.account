

"use client";

import { useState, useTransition, useContext, useEffect } from "react";
import { useToast } from "@/core/hooks/use-toast";
import { requestAccountDeletion } from "@/services/data/delete";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Trash2 } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/ui/back-button";
import { Geolocation } from "@/core/providers/geolocation";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { getAccountType } from '@/services/user';
import { getActiveAccountId } from '@/core/auth/verify';
import { useRouter } from "next/navigation";
import { redirectInApp } from "@/services/navigation";


export default function DeleteAccountPage() {
  const [isPending, startTransition] = useTransition();
  const [isRequested, setIsRequested] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const { toast } = useToast();
  const geo = useContext(Geolocation);
  const router = useRouter();

  useEffect(() => {
    async function checkAccountStatus() {
        const accountId = await getActiveAccountId();
        if (accountId) {
            const status = await getAccountType(accountId);
            if (status === 'deletion_requested') {
                setIsRequested(true);
            }
        }
        setLoadingStatus(false);
    }
    checkAccountStatus();
  }, []);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
      const result = await requestAccountDeletion({ password: formData.get("password") as string }, locationString);
      if (result.success) {
        toast({
          title: "Deletion Request Submitted",
          description:
            "Your account is scheduled for deletion. You will be logged out now.",
        });
        redirectInApp(router, '/auth/signout');
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    });
  };

  return (
    <div className="grid gap-8">
        <BackButton href="/manage/data" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Delete Account</h1>
        <p className="text-muted-foreground">
          Permanently delete your account and all associated data.
        </p>
      </div>

      <form action={handleSubmit}>
        <Card>
            <CardHeader>
            <SecondaryHeader
                title="Request Account Deletion"
                description="Please read the following information carefully before proceeding."
            />
            </CardHeader>
            <CardContent className="space-y-4">
            <Alert variant="destructive">
                <AlertTitle>This action is irreversible.</AlertTitle>
                <AlertDescription>
                <ul className="list-disc space-y-2 pl-5 mt-2">
                    <li>
                    Once requested, your account will be scheduled for permanent deletion after 30 days.
                    </li>
                    <li>
                    You will be logged out. Signing back in within 30 days will cancel the deletion request.
                    </li>
                    <li>After 30 days, an administrator will process the final deletion and your data will be unrecoverable.</li>
                </ul>
                </AlertDescription>
            </Alert>
            {isRequested && (
                <Alert variant="default" className="border-primary text-primary [&>svg]:text-primary">
                    <AlertTitle>Request Received</AlertTitle>
                    <AlertDescription>
                        Your account deletion request has been submitted. You can cancel by logging in within the next 30 days.
                    </AlertDescription>
                </Alert>
            )}
             {showPasswordPrompt && !isRequested && (
                <div className="space-y-2 pt-4">
                    <Label htmlFor="password">Enter your password to confirm</Label>
                    <Input id="password" name="password" type="password" required autoFocus />
                </div>
            )}
            </CardContent>
            <CardFooter>
                 {!showPasswordPrompt && !isRequested && (
                    <Button type="button" onClick={() => setShowPasswordPrompt(true)} variant="destructive" disabled={loadingStatus}>
                         <Trash2 className="mr-2 h-4 w-4" />
                        Request Account Deletion
                    </Button>
                 )}
                 {showPasswordPrompt && !isRequested && (
                     <Button variant="destructive" disabled={isPending || loadingStatus}>
                        {isPending ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<Trash2 className="mr-2 h-4 w-4" />)}
                        Confirm Deletion
                    </Button>
                 )}
                 {isRequested && (
                     <Button variant="destructive" disabled>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Deletion Requested
                    </Button>
                 )}
            </CardFooter>
        </Card>
      </form>
    </div>
  );
}
