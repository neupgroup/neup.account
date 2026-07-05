"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { getUserProfile } from '@/services/user'
import { updateUserProfile } from "@/services/profile"
import { useToast } from "@/neup.core/hooks/use-toast"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { BackButton } from '@/components/ui/back-button'
import { PrimaryHeader } from '@/components/ui/primary-header'

const displayFormSchema = z.object({
  nameDisplay: z.string().optional(),
  accountPhoto: z.string().url("Please enter a valid URL.").optional().or(z.literal('')),
});

type DisplayFormValues = z.infer<typeof displayFormSchema>;

export default function ManagedUserDisplayPage() {
    const params = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [profile, setProfile] = useState<any>(null);

    const form = useForm<DisplayFormValues>({
        resolver: zodResolver(displayFormSchema),
        defaultValues: {
            nameDisplay: "",
            accountPhoto: "",
        },
    });

    useEffect(() => {
        const fetchData = async () => {
            const profileData = await getUserProfile(params.id);
            if (profileData) {
                setProfile(profileData);
                form.reset({
                    nameDisplay: profileData.nameDisplay || "",
                    accountPhoto: profileData.accountPhoto || "",
                });
            }
            setLoading(false);
        }
        fetchData();
    }, [params.id, form]);

    async function onSubmit(data: DisplayFormValues) {
        const result = await updateUserProfile(params.id, data);
        if (result.success) {
            toast({ title: "Success", description: "Display information updated.", className: "bg-accent text-accent-foreground" });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }

    if (loading) {
        return <Skeleton className="h-64 w-full" />
    }

    if (!profile) {
        return <p>User profile not found.</p>
    }

    return (
        <div className="space-y-8">
            <BackButton href={`/manage/${params.id}/profile`} />
            <PrimaryHeader
                title="Display Information"
                description={`Update the public display name and photo for @${profile.neupIdPrimary}.`}
            />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Display Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="flex items-center gap-6">
                                <div className="flex-shrink-0">
                                    <Label>Photo</Label>
                                    <Avatar className="h-24 w-24 mt-2 rounded-lg">
                                        <AvatarImage src={form.watch('accountPhoto') || undefined} alt="Display Photo" data-ai-hint="person" />
                                        <AvatarFallback className="rounded-lg">
                                            {`${profile?.nameFirst?.[0] || ''}${profile?.nameLast?.[0] || ''}`.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                                <div className="flex-grow space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="nameDisplay"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Display Name</FormLabel>
                                                <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="accountPhoto"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Photo URL</FormLabel>
                                                <FormControl><Input placeholder="https://..." {...field} value={field.value ?? ''} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
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
