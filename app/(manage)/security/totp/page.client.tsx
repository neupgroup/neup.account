
"use client";

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { useToast } from '@/core/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getTotpStatus, generateTotpSecret, verifyAndEnableTotp, disableTotp, getServerTime } from '@/services/security/totp';
import { Smartphone, Loader2, Clock } from '@/components/icons';
import { BackButton } from '@/components/ui/back-button';
import { SecondaryHeader } from '@/components/ui/secondary-header';

type SetupState = {
    secret: string;
    qrCodeUrl: string;
} | null;

function ServerTimeDisplay() {
    const [serverDate, setServerDate] = useState<Date | null>(null);

    useEffect(() => {
        const fetchTime = async () => {
            const timeString = await getServerTime();
            setServerDate(new Date(timeString));
        };

        fetchTime();
    }, []);

    useEffect(() => {
        if (!serverDate) return;

        const interval = setInterval(() => {
            setServerDate(currentDate => {
                if (!currentDate) return null;
                const newDate = new Date(currentDate);
                newDate.setSeconds(newDate.getSeconds() + 1);
                return newDate;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [serverDate]);

    return (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground p-2 rounded-md bg-muted/50">
            <Clock className="h-4 w-4" />
            <span>Server Time:</span>
            {serverDate ? (
                <span className="font-mono">{serverDate.toLocaleString()}</span>
            ) : (
                <span className="font-mono">Syncing...</span>
            )}
        </div>
    );
}

export default function AuthenticatorAppPage() {
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
    const [setupState, setSetupState] = useState<SetupState>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    useEffect(() => {
        async function checkStatus() {
            const { isEnabled } = await getTotpStatus();
            setIsEnabled(isEnabled);
        }
        checkStatus();
    }, []);

    const handleSetup = () => {
        startTransition(async () => {
            try {
                const data = await generateTotpSecret();
                setSetupState(data);
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error', description: 'Could not start setup process.' });
            }
        });
    }

    const handleVerify = (formData: FormData) => {
        const token = formData.get('token') as string;
        if (!token || !setupState) return;
        
        startTransition(async () => {
            const result = await verifyAndEnableTotp({ secret: setupState.secret, token });
            if (result.success) {
                toast({ title: 'Success!', description: 'Authenticator app enabled.', className: 'bg-accent text-accent-foreground' });
                setIsEnabled(true);
                setSetupState(null);
            } else {
                toast({ variant: 'destructive', title: 'Verification Failed', description: result.error });
            }
        });
    }
    
    const handleDisable = (formData: FormData) => {
        const password = formData.get('password') as string;
        if (!password) return;

        startTransition(async () => {
            const result = await disableTotp({ password });
             if (result.success) {
                toast({ title: 'Success!', description: 'Authenticator app disabled.' });
                setIsEnabled(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }

    const renderCardContent = () => {
        if (isEnabled === null) {
            return (
                <CardContent className="pt-6">
                    <Skeleton className="h-48 w-full" />
                </CardContent>
            );
        }
        
        if (setupState) {
            return (
                <>
                    <CardContent className="pt-6 grid gap-6 md:grid-cols-2 items-center">
                        <div className="flex flex-col items-start gap-4">
                            <Image src={setupState.qrCodeUrl} alt="QR Code" width={200} height={200} data-ai-hint="qr code" />
                             <ServerTimeDisplay />
                        </div>
                        <div className="space-y-4">
                             <p className="text-sm text-muted-foreground">Can't scan? Enter this key manually:</p>
                             <div className="p-3 rounded-md bg-muted font-mono text-center tracking-wider text-sm">
                                {setupState.secret.match(/.{1,4}/g)?.join(' ')}
                            </div>
                            <form action={handleVerify} className="space-y-4">
                                <Input name="token" placeholder="Enter 6-digit code" maxLength={6} required className="text-center tracking-[0.3em]" />
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="destructive" type="button" onClick={() => setSetupState(null)}>Cancel</Button>
                                    <Button type="submit" className="w-full" disabled={isPending}>
                                        {isPending ? <Loader2 className="animate-spin" /> : 'Verify & Enable'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </CardContent>
                </>
            )
        }

        if (isEnabled) {
            return (
                <>
                    <CardContent className="pt-6">
                        <Alert variant="default" className="border-primary/50 text-primary [&>svg]:text-primary">
                            <AlertTitle>Status: Enabled</AlertTitle>
                            <AlertDescription>
                               You will be asked for a code from your authenticator app when you sign in.
                            </AlertDescription>
                        </Alert>
                         <form action={handleDisable} className="mt-6 space-y-4">
                            <p className="text-sm font-medium">To disable 2FA, please enter your password.</p>
                            <Input name="password" type="password" placeholder="Enter your password" required />
                            <Button type="submit" variant="destructive" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin" /> : 'Disable Authenticator App'}
                            </Button>
                        </form>
                    </CardContent>
                </>
            )
        }

        return (
            <>
                <CardContent className="space-y-4 pt-6">
                    <p className="text-sm text-muted-foreground">
                        Use an app like Google Authenticator, Authy, or 1Password to generate a unique code when you sign in. This helps protect your account from unauthorized access.
                    </p>
                    <Button onClick={handleSetup} disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin" /> : <><Smartphone className="mr-2 h-4 w-4" />Set up Authenticator</>}
                    </Button>
                </CardContent>
            </>
        );
    }

    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Authenticator App</h1>
                <p className="text-muted-foreground">
                    Use an authenticator app for an extra layer of security (2FA).
                </p>
            </div>
             <div className="space-y-2">
                <SecondaryHeader
                    title="Manage 2FA"
                    description="Enable or disable two-factor authentication for your account."
                />
                <Card>
                    {renderCardContent()}
                </Card>
            </div>
        </div>
    );
}
