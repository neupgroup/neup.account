
"use client";

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '#/core/hooks/useToast';
import { Card, CardContent, CardFooter, CardHeader } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { Skeleton } from '#/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { Textarea } from '#/components/ui/textarea';
import { TitleSet } from '#/components/element/titleset';
import { approveAccountDeletion, cancelAccountDeletion, getDeletionStatus, requestAccountDeletionByAdmin } from '@/services/manage/requests/deletion';
import { useRouter } from 'next/navigation';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '#/components/ui/form';
import { redirectInApp } from '@/.neup/core/helpers/link/navigation';

type DeletionStatus = {
    status: 'none' | 'pending' | 'deleted' | 'is_root';
    requestedAt?: string | null;
};

const requestByAdminSchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required."),
});

type RequestByAdminFormValues = z.infer<typeof requestByAdminSchema>;


export function DeletionManager({ accountId }: { accountId: string }) {
    const [status, setStatus] = useState<DeletionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const router = useRouter();
    
    const form = useForm<RequestByAdminFormValues>({
        resolver: zodResolver(requestByAdminSchema),
    });
    
    const fetchStatus = async () => {
        setLoading(true);
        const deletionStatus = await getDeletionStatus(accountId);
        setStatus(deletionStatus);
        setLoading(false);
    }

    useEffect(() => {
        fetchStatus();
    }, [accountId]);

    const handleApprove = () => {
        startTransition(async () => {
            const result = await approveAccountDeletion(accountId);
            if(result.success) {
                toast({ title: 'Success', description: 'Account has been permanently deleted.', className: 'bg-accent text-accent-foreground' });
                redirectInApp(router, '/manage');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }
    
    const handleCancel = () => {
        startTransition(async () => {
            const result = await cancelAccountDeletion(accountId);
            if(result.success) {
                toast({ title: 'Success', description: 'Account deletion request has been cancelled.' });
                await fetchStatus();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }

    const handleAdminRequest = (data: RequestByAdminFormValues) => {
        startTransition(async () => {
            const result = await requestAccountDeletionByAdmin(accountId, data);
            if (result.success) {
                toast({ title: 'Success', description: 'Account deletion request has been submitted.' });
                await fetchStatus();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };

    if (loading) {
        return <Skeleton className="h-48 w-full" />;
    }

    if (status?.status === 'is_root') {
        return (
             <div className="grid gap-4">
                <TitleSet level={1} title="Manual Deletion" />
                <Card>
                     <CardHeader>
                         <Alert variant="destructive">
                            <ShieldAlert className="h-4 w-4" />
                            <AlertTitle>Action Not Permitted</AlertTitle>
                            <AlertDescription>
                               Root user accounts cannot be deleted through this panel.
                            </AlertDescription>
                        </Alert>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    if (status?.status === 'pending') {
        return (
            <div className="grid gap-4">
                <TitleSet level={1} title="Deletion Pending" />
                <Card>
                    <CardHeader>
                         <Alert variant="destructive">
                            <Trash2 className="h-4 w-4" />
                            <AlertTitle>This account is scheduled for deletion.</AlertTitle>
                            <AlertDescription>
                                The request was made on {status.requestedAt}. You can approve the deletion immediately or cancel the request.
                            </AlertDescription>
                        </Alert>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                       <Button onClick={handleApprove} disabled={isPending} variant="solid" convey="danger">
                            {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                            Approve Deletion Now
                        </Button>
                         <Button onClick={handleCancel} disabled={isPending} variant="outlined">
                            {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                            Cancel Request
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
     if (status?.status === 'deleted') {
         return (
             <Alert>
                <AlertTitle>Account Deleted</AlertTitle>
                <AlertDescription>This account has already been deleted.</AlertDescription>
            </Alert>
         )
     }

    // Status is 'none'
    return (
        <div className="grid gap-4">
            <TitleSet level={1} title="Manual Deletion" subtitle="This action is irreversible and should only be taken in extreme circumstances."/>
            <Card>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleAdminRequest)}>
                        <CardHeader>
                            <Alert variant="destructive">
                                <Trash2 className="h-4 w-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>
                                This will schedule the user's account for deletion after the standard grace period. The user will be notified.
                                </AlertDescription>
                            </Alert>
                        </CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reason for Deletion</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Provide a reason for this administrative action..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter>
                            <Button variant="solid" convey="danger" htmlType="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                                Request Deletion
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
