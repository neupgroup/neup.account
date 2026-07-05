"use client"

import React, { useEffect, useState, useTransition, use } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { getUserNeupIdDetails as fetchUserNeupIdDetails } from '@/services/user'
import { addNeupId, removeNeupId, setPrimaryNeupId } from '@/services/manage/accounts/neupid';
import { useToast } from "@/neup.core/hooks/use-toast"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { BackButton } from '@/components/ui/back-button'
import { PrimaryHeader } from '@/components/ui/primary-header'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Loader2, Plus } from '@/components/icons'
import { checkNeupIdAvailability } from '@/services/user';

type NeupId = {
    id: string;
    isPrimary: boolean;
};

const addNeupIdSchema = z.object({
  newNeupId: z.string().min(3, "NeupID must be at least 3 characters."),
});

type AddNeupIdFormValues = z.infer<typeof addNeupIdSchema>;

export default function RootUserNeupidPage() {
    const resolvedParams = useParams<{ id: string }>();
    const [neupIds, setNeupIds] = useState<NeupId[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [userNeupId, setUserNeupId] = useState('');
    const [isPending, startTransition] = useTransition();

    const form = useForm<AddNeupIdFormValues>({
        resolver: zodResolver(addNeupIdSchema),
        defaultValues: { newNeupId: "" },
    });

    const fetchNeupIds = async () => {
        setLoading(true);
        const neupIdDetails = await fetchUserNeupIdDetails(resolvedParams?.id || '');
        
        const sortedDetails = [...neupIdDetails].sort((a, b) => (b.isPrimary ? 1 : -1));
        setNeupIds(sortedDetails);
        setUserNeupId(sortedDetails.find(n => n.isPrimary)?.id || sortedDetails[0]?.id || resolvedParams.id);
        setLoading(false);
    }
    
    useEffect(() => {
        fetchNeupIds();
    }, [resolvedParams.id]);

    async function handleAdd(data: AddNeupIdFormValues) {
        startTransition(async () => {
            const check = await checkNeupIdAvailability(data.newNeupId);
            if (!check.available) {
                toast({ variant: "destructive", title: "Error", description: "This NeupID is already taken." });
                return;
            }

            const result = await addNeupId(resolvedParams.id, data.newNeupId);
            if (result.success) {
                toast({ title: "Success", description: "NeupID added.", className: "bg-accent text-accent-foreground" });
                form.reset();
                await fetchNeupIds();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }
    
    async function handleRemove(neupIdToRemove: string) {
        startTransition(async () => {
            const result = await removeNeupId(neupIdToRemove);
            if (result.success) {
                toast({ title: "Success", description: "NeupID removed." });
                await fetchNeupIds();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }

    async function handleSetPrimary(neupIdToSet: string) {
        startTransition(async () => {
            const result = await setPrimaryNeupId(resolvedParams.id, neupIdToSet);
            if (result.success) {
                toast({ title: "Success", description: "Primary NeupID updated." });
                await fetchNeupIds();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }

    if (loading) {
        return <Skeleton className="h-64 w-full" />
    }

    return (
        <div className="space-y-8">
            <BackButton href={`/manage/${resolvedParams.id}/profile`} />
             <PrimaryHeader
                title="NeupID Management"
                description={`Manage unique identifiers for @${userNeupId}.`}
            />
            
             <Card>
                <CardHeader>
                    <CardTitle>Associated NeupIDs</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="divide-y">
                        {neupIds.map(nid => (
                            <div key={nid.id} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-2">
                                    <p className="font-mono">{nid.id}</p>
                                    {nid.isPrimary && <Badge>Primary</Badge>}
                                </div>
                                <div className="flex gap-2">
                                    {!nid.isPrimary && (
                                        <>
                                            <Button variant="outline" size="sm" onClick={() => handleSetPrimary(nid.id)} disabled={isPending}>Set as Primary</Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={isPending}>Remove</Button></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>This will permanently remove the NeupID <span className="font-mono font-bold">{nid.id}</span> from this account.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleRemove(nid.id)} className="bg-destructive hover:bg-destructive/90">Remove NeupID</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                 <CardHeader>
                    <CardTitle>Add New NeupID</CardTitle>
                    <CardDescription>Directly add a new, available NeupID to this user's account.</CardDescription>
                </CardHeader>
                 <CardContent>
                     <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleAdd)} className="flex items-start gap-2">
                            <FormField control={form.control} name="newNeupId" render={({ field }) => (
                                <FormItem className="flex-grow">
                                    <FormControl>
                                        <Input placeholder="Enter desired NeupID" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                                <span className="sr-only md:not-sr-only md:ml-2">Add NeupID</span>
                            </Button>
                        </form>
                    </Form>
                 </CardContent>
            </Card>
        </div>
    )
}
