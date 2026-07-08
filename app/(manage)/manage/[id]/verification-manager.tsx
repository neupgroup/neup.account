'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/core/hooks/use-toast';
import { TertiaryHeader } from '@/components/ui/tertiary-header';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { grantVerification, revokeVerification, getAccountVerification } from '@/services/manage/verifications';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

const grantSchema = z.object({
  category: z.string().min(3, "Category is required."),
  reason: z.string().min(10, "A reason of at least 10 characters is required."),
});

const revokeSchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required."),
});

type VerificationDetails = {
    status: 'approved' | 'revoked' | 'pending' | 'none';
    category?: string;
    verifiedAt?: string;
    verifiedBy?: string;
    reason?: string;
};

export function VerificationManager({ accountId }: { accountId: string }) {
    const [details, setDetails] = useState<VerificationDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const grantForm = useForm<z.infer<typeof grantSchema>>({ 
        resolver: zodResolver(grantSchema),
        defaultValues: {
            category: '',
            reason: '',
        }
    });
    const revokeForm = useForm<z.infer<typeof revokeSchema>>({ 
        resolver: zodResolver(revokeSchema),
        defaultValues: {
            reason: '',
        }
    });
    
    useEffect(() => {
        async function fetchDetails() {
            setLoading(true);
            const verificationData = await getAccountVerification(accountId);
            if (verificationData && verificationData.verified) {
                setDetails({
                    status: 'approved',
                    category: verificationData.category,
                    verifiedAt: verificationData.verifiedAt,
                });
            } else {
                setDetails({ status: 'none' });
            }
            setLoading(false);
        }
        fetchDetails();
    }, [accountId]);

    const handleGrant = (data: z.infer<typeof grantSchema>) => {
        startTransition(async () => {
            const result = await grantVerification(accountId, data);
            if (result.success) {
                toast({ title: 'Success', description: 'User has been verified.', className: 'bg-accent text-accent-foreground' });
                // Re-fetch details
                const verificationData = await getAccountVerification(accountId);
                if (verificationData && verificationData.verified) {
                    setDetails({
                        status: 'approved',
                        category: verificationData.category,
                        verifiedAt: verificationData.verifiedAt,
                    });
                }
                grantForm.reset();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };
    
    const handleRevoke = (data: z.infer<typeof revokeSchema>) => {
         startTransition(async () => {
            const result = await revokeVerification(accountId, data.reason);
            if (result.success) {
                toast({ title: 'Success', description: 'User verification has been revoked.'});
                setDetails(d => d ? { ...d, status: 'revoked' } : null);
                revokeForm.reset();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }
    
    if (loading) {
        return <Skeleton className="h-48 w-full" />;
    }

    if (details?.status === 'approved') {
        return (
            <div className="grid gap-4">
                <TertiaryHeader title="Verification Status" />
                <Card>
                    <CardHeader>
                         <Alert variant="default" className="border-green-500/50 bg-green-500/10 text-green-700">
                            <CheckCircle2 className="h-4 w-4 !text-green-500" />
                            <AlertTitle>Account Verified</AlertTitle>
                            <AlertDescription>
                                Verified as <strong>{details.category}</strong> on {details.verifiedAt}.
                            </AlertDescription>
                        </Alert>
                    </CardHeader>
                    <CardContent>
                         <Form {...revokeForm}>
                            <form onSubmit={revokeForm.handleSubmit(handleRevoke)} className="space-y-4">
                                <FormField control={revokeForm.control} name="reason" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reason for Revocation</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="e.g., Violation of community guidelines." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                 <Button type="submit" variant="destructive" disabled={isPending}>
                                    {isPending ? <Loader2 className="animate-spin mr-2" /> : <XCircle className="mr-2" />}
                                    Revoke Verification
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        );
    }


    return (
        <div className="grid gap-4">
            <TertiaryHeader title="Grant Verification" description="Manually grant a verification badge to this user."/>
            <Card>
                <Form {...grantForm}>
                    <form onSubmit={grantForm.handleSubmit(handleGrant)}>
                        <CardContent className="space-y-4 pt-6">
                            {details?.status === 'revoked' && (
                                <Alert variant="destructive">
                                    <AlertTitle>Verification Revoked</AlertTitle>
                                    <AlertDescription>This user's verification was previously revoked.</AlertDescription>
                                </Alert>
                            )}
                            <FormField control={grantForm.control} name="category" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Verification Category</FormLabel>
                                    <FormControl><Input placeholder="e.g., Public Figure, Official Brand" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={grantForm.control} name="reason" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reason for Verification</FormLabel>
                                    <FormControl><Textarea placeholder="e.g., Confirmed identity via official documents." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin mr-2"/> : <ShieldCheck className="mr-2"/>}
                                Grant Verification
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}