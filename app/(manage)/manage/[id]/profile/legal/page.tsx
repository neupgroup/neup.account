

"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
import { BackButton } from '@/components/ui/back-button'
import { PrimaryHeader } from '@/components/ui/primary-header'
import { getUserProfile } from '@/services/user'


const nameFormSchema = z.object({
  nameFirst: z.string().min(1, "First name is required"),
  nameMiddle: z.string().optional(),
  nameLast: z.string().min(1, "Last name is required"),
});

type NameFormValues = z.infer<typeof nameFormSchema>;

export default function RootUserNamePage() {
    const params = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [profile, setProfile] = useState<any>(null);

    const form = useForm<NameFormValues>({
        resolver: zodResolver(nameFormSchema),
        defaultValues: {
            nameFirst: "",
            nameMiddle: "",
            nameLast: "",
        },
    });

    useEffect(() => {
        const fetchData = async () => {
            const profileData = await getUserProfile(params.id);
            if(profileData) {
                setProfile(profileData);
                form.reset({
                    nameFirst: profileData.nameFirst || "",
                    nameMiddle: profileData.nameMiddle || "",
                    nameLast: profileData.nameLast || "",
                });
            }
            setLoading(false);
        }
        fetchData();
    }, [params.id, form]);

    async function onSubmit(data: NameFormValues) {
        const result = await updateUserProfile(params.id, data);
        if (result.success) {
            toast({ title: "Success", description: "Name updated successfully.", className: "bg-accent text-accent-foreground" });
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
                title="Legal Name"
                description={`Update the legal name for @${profile.neupIdPrimary}.`}
            />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Legal Name</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField control={form.control} name="nameFirst" render={({ field }) => ( <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="nameMiddle" render={({ field }) => ( <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="nameLast" render={({ field }) => ( <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
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
