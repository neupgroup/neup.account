
"use client";

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/core/hooks/use-toast';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { setProStatus } from '@/services/manage/users';
import { getUserProfile } from '@/services/user';
import { Gem, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { TertiaryHeader } from '@/components/ui/tertiary-header';

const proActionSchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required."),
});

type ProActionValues = z.infer<typeof proActionSchema>;

export function NeupProManager({ accountId }: { accountId: string }) {
    const [isPro, setIsPro] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const form = useForm<ProActionValues>({ 
        resolver: zodResolver(proActionSchema),
    });
    
    useEffect(() => {
        async function fetchStatus() {
            setLoading(true);
            const profile = await getUserProfile(accountId);
            if (profile) {
                setIsPro(profile.pro === true);
            } else {
                setIsPro(false);
            }
            setLoading(false);
        }
        fetchStatus();
    }, [accountId]);

    const handleAction = (activate: boolean) => (data: ProActionValues) => {
        startTransition(async () => {
            const result = await setProStatus(accountId, activate, data.reason);
            if (result.success) {
                setIsPro(activate);
                toast({ 
                    title: 'Success', 
                    description: `Neup.Pro has been ${activate ? 'activated' : 'deactivated'}.`,
                    className: 'bg-accent text-accent-foreground'
                });
                form.reset();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };
    
    if (loading) {
        return <Skeleton className="h-48 w-full" />;
    }

    if (isPro) {
        return (
            <div className="grid gap-4">
                <TertiaryHeader title="Current Status" />
                <Card>
                    <CardHeader>
                         <Alert variant="default" className="border-primary/50 text-primary [&>svg]:text-primary">
                            <Gem className="h-4 w-4 !text-primary" />
                            <AlertTitle>Neup.Pro is Active</AlertTitle>
                            <AlertDescription>
                                This user has access to all Neup.Pro features.
                            </AlertDescription>
                        </Alert>
                    </CardHeader>
                    <CardContent>
                         <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleAction(false))} className="space-y-4">
                                <FormField control={form.control} name="reason" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reason for Deactivation</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="e.g., Subscription expired." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                 <Button type="submit" variant="destructive" disabled={isPending}>
                                    {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                                    Deactivate Neup.Pro
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
            <TertiaryHeader title="Activate Neup.Pro" description="Manually grant Neup.Pro status to this user."/>
            <Card>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleAction(true))}>
                        <CardContent className="space-y-4 pt-6">
                            <FormField control={form.control} name="reason" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reason for Activation</FormLabel>
                                    <FormControl><Textarea placeholder="e.g., Manual payment verified." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin mr-2"/> : <Gem className="mr-2"/>}
                                Activate Neup.Pro
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
