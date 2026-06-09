
"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { getUserContacts, getUserNeupIds } from '@/services/user'
import { updateUserProfile } from "@/services/profile"
import { useToast } from "@/core/hooks/use-toast"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { PhoneInput } from "@/components/ui/phone-input"
import { BackButton } from '@/components/ui/back-button'
import { PrimaryHeader } from '@/components/ui/primary-header'
import { Separator } from '@/components/ui/separator'

const contactFormSchema = z.object({
  primaryPhone: z.string().optional(),
  secondaryPhone: z.string().optional(),
  permanentLocation: z.string().optional(),
  currentLocation: z.string().optional(),
  workLocation: z.string().optional(),
  otherLocation: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

export default function RootUserContactPage() {
    const params = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [userNeupId, setUserNeupId] = useState('');

    const form = useForm<ContactFormValues>({
        resolver: zodResolver(contactFormSchema),
        defaultValues: {
            primaryPhone: "",
            secondaryPhone: "",
            permanentLocation: "",
            currentLocation: "",
            workLocation: "",
            otherLocation: "",
        },
    });
    
    const watchPrimaryPhone = useWatch({ control: form.control, name: "primaryPhone" });
    const watchPermanentLocation = useWatch({ control: form.control, name: "permanentLocation" });
    const watchCurrentLocation = useWatch({ control: form.control, name: "currentLocation" });
    const watchWorkLocation = useWatch({ control: form.control, name: "workLocation" });

    useEffect(() => {
        const fetchData = async () => {
            const [contactsData, neupIds] = await Promise.all([
                getUserContacts(params.id),
                getUserNeupIds(params.id)
            ]);
            setUserNeupId(neupIds[0] || params.id);
            form.reset({
                primaryPhone: contactsData.primaryPhone || "",
                secondaryPhone: contactsData.secondaryPhone || "",
                permanentLocation: contactsData.permanentLocation || "",
                currentLocation: contactsData.currentLocation || "",
                workLocation: contactsData.workLocation || "",
                otherLocation: contactsData.otherLocation || "",
            });
            setLoading(false);
        }
        fetchData();
    }, [params.id, form]);

    async function onSubmit(data: ContactFormValues) {
        const result = await updateUserProfile(params.id, data);
        if (result.success) {
            toast({ title: "Success", description: "Contact information updated.", className: "bg-accent text-accent-foreground" });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    if (loading) {
        return <Skeleton className="h-64 w-full" />
    }

    return (
        <div className="space-y-8">
            <BackButton href={`/manage/${params.id}/profile`} />
            <PrimaryHeader
                title="Contact Information"
                description={`Manage phone numbers and addresses for @${userNeupId}.`}
            />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Contact Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <FormLabel>Phone</FormLabel>
                                <FormField control={form.control} name="primaryPhone" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><PhoneInput placeholder="Primary Phone" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                {!!watchPrimaryPhone && (
                                    <FormField control={form.control} name="secondaryPhone" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><PhoneInput placeholder="Secondary Phone" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                )}
                            </div>
                            
                            <Separator />

                             <div className="space-y-2">
                                <FormLabel>Location</FormLabel>
                                 <FormField control={form.control} name="permanentLocation" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><Input placeholder="Permanent Location" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                 {!!watchPermanentLocation && (
                                     <FormField control={form.control} name="currentLocation" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><Input placeholder="Current Location" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                 )}
                                  {!!watchPermanentLocation && !!watchCurrentLocation && (
                                     <FormField control={form.control} name="workLocation" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><Input placeholder="Work Location" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                 )}
                                  {!!watchPermanentLocation && !!watchCurrentLocation && !!watchWorkLocation && (
                                     <FormField control={form.control} name="otherLocation" render={({ field }) => ( <FormItem className="space-y-0"><FormControl><Input placeholder="Other Location" value={field.value ?? ''} onChange={field.onChange} className="border-b rounded-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1" /></FormControl><FormMessage /></FormItem> )} />
                                 )}
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
