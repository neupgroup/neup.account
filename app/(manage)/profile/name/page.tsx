"use client"

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { updateUserProfile } from "@/services/profile"
import { useToast } from "@/core/hooks/use-toast"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useSession } from '@/core/providers/session'
import { BackButton } from '@/components/ui/back-button'
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions'

const nameFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
});

type NameFormValues = z.infer<typeof nameFormSchema>;

export default function NamePage() {
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { profile, accountId, permissions, loading: sessionLoading } = useSession();

    if (!sessionLoading && !hasAnyPermission(permissions, PROFILE_SECTION_PERMISSIONS.legal)) {
        notFound();
    }

    const form = useForm<NameFormValues>({
        resolver: zodResolver(nameFormSchema),
        defaultValues: {
            firstName: "",
            middleName: "",
            lastName: "",
        },
    });

    useEffect(() => {
        if (profile) {
            form.reset({
                firstName: profile?.nameFirst || "",
                middleName: profile?.nameMiddle || "",
                lastName: profile?.nameLast || "",
            });
            setLoading(false);
        }
    }, [profile, form]);

    async function onSubmit(data: NameFormValues) {
        if (!accountId) {
            toast({ variant: "destructive", title: "Error", description: "Not authenticated." });
            return;
        }

        const result = await updateUserProfile(accountId, data);

        if (result.success) {
            toast({ title: "Success", description: "Name updated successfully.", className: "bg-accent text-accent-foreground" });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    if (loading) {
        return <Skeleton className="h-64 w-full" />
    }

    return (
         <div className="space-y-8">
            <BackButton href="/manage/profile" />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Legal Name</CardTitle>
                            <CardDescription>Manage your legal first, middle, and last name.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField control={form.control} name="firstName" render={({ field }) => ( <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="middleName" render={({ field }) => ( <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="lastName" render={({ field }) => ( <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        </CardContent>
                    </Card>
                     <div className="flex justify-end">
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
