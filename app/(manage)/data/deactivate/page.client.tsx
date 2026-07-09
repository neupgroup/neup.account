"use client";

import { useState, useTransition, useContext } from "react";
import { useToast } from "@/core/hooks/use-toast";
import { deactivateAccount } from "@/services/data/deactivate";
import {  Card, CardContent, CardFooter, CardHeader} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, PowerOff } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/ui/back-button";
import { Geolocation } from "@/core/providers/geolocation";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { useRouter } from "next/navigation";
import { redirectInApp } from "@/core/helpers/navigation";


export default function DeactivateAccountPage() {
  const [isPending, startTransition] = useTransition();
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const { toast } = useToast();
  const geo = useContext(Geolocation);
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
      const result = await deactivateAccount({ password: formData.get("password") as string }, locationString);
      if (result.success) {
        toast({
          title: "Account Deactivated",
          description: "Your account has been deactivated. You can reactivate it by logging in again.",
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
        <h1 className="text-3xl font-bold tracking-tight">Deactivate Account</h1>
        <p className="text-muted-foreground">
          Temporarily deactivate your account.
        </p>
      </div>

       <form action={handleSubmit}>
        <Card>
            <CardHeader>
            <SecondaryHeader
                title="Deactivate Your Account"
                description="This action will temporarily close your account."
            />
            </CardHeader>
            <CardContent className="space-y-4">
            <Alert>
                <AlertTitle>What happens when you deactivate?</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc space-y-2 pl-5 mt-2">
                        <li>Your profile and account will not be visible to others.</li>
                        <li>You will be logged out of all devices.</li>
                        <li>To reactivate your account, simply sign in again with your credentials.</li>
                    </ul>
                </AlertDescription>
            </Alert>
            {showPasswordPrompt && (
                <div className="space-y-2 pt-4">
                    <Label htmlFor="password">Enter your password to confirm</Label>
                    <Input id="password" name="password" type="password" required autoFocus />
                </div>
            )}
            </CardContent>
            <CardFooter>
                 {!showPasswordPrompt ? (
                    <Button type="button" onClick={() => setShowPasswordPrompt(true)} variant="secondary">
                        <PowerOff className="mr-2 h-4 w-4" />
                        Deactivate Account
                    </Button>
                ) : (
                    <Button type="submit" variant="secondary" disabled={isPending}>
                        {isPending ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<PowerOff className="mr-2 h-4 w-4" />)}
                        Confirm Deactivation
                    </Button>
                )}
            </CardFooter>
        </Card>
      </form>
    </div>
  );
}
