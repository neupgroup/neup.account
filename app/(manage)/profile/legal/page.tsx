"use client"

import { useContext, useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { updateBrandLegalProfile, updateUserProfile } from "@/services/profile"
import { useToast } from "@/neup.core/hooks/use-toast"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useSession } from '@/neup.core/providers/session'
import { BackButton } from '@/components/ui/back-button'
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/neup.core/auth/profile-permissions'
import { Checkbox } from '@/components/ui/checkbox'
import { Geolocation } from '@/neup.core/providers/geolocation'
import { permission } from '@/neup.logica/permission';
import { useSelectedProfilePage } from '../use-selected-profile-page';

const pagePermissions = [
    permission('profile.legal.view.self', 'for_individual', 'page'),
    permission('profile.legal.update.self', 'for_individual', 'page'),
];

const individualLegalFormSchema = z.object({
  nameFirst: z.string().min(1, "First name is required"),
  nameMiddle: z.string().optional(),
  nameLast: z.string().min(1, "Last name is required"),
});

const brandLegalFormSchema = z.object({
  isLegalEntity: z.boolean(),
  nameLegal: z.string().optional(),
  incorporationDate: z.string().optional(),
  headOfficeLocation: z.string().optional(),
});

type IndividualLegalFormValues = z.infer<typeof individualLegalFormSchema>;
type BrandLegalFormValues = z.infer<typeof brandLegalFormSchema>;

export default function LegalPage() {
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const geo = useContext(Geolocation);
    const {
        profile: sessionProfile,
        accountId: sessionAccountId,
        permissions: sessionPermissions,
        loading: sessionLoading,
        refetch,
    } = useSession();
    const {
        selectedProfile,
        selectedProfileDenied,
        loadingSelectedProfile,
        targetAccountId,
        targetPermissions,
        targetProfile,
        profileBackHref,
        refreshSelectedProfile,
    } = useSelectedProfilePage({
        requiredPermissions: PROFILE_SECTION_PERMISSIONS.legal,
        sessionAccountId,
        sessionPermissions,
        sessionProfile,
    });

    if (selectedProfileDenied) {
        notFound();
    }

    if (!sessionLoading && !loadingSelectedProfile && !hasAnyPermission(targetPermissions, PROFILE_SECTION_PERMISSIONS.legal)) {
        notFound();
    }

    const individualForm = useForm<IndividualLegalFormValues>({
        resolver: zodResolver(individualLegalFormSchema),
        defaultValues: {
            nameFirst: "",
            nameMiddle: "",
            nameLast: "",
        },
    });

    const brandForm = useForm<BrandLegalFormValues>({
        resolver: zodResolver(brandLegalFormSchema),
        defaultValues: {
            isLegalEntity: false,
            nameLegal: "",
            incorporationDate: "",
            headOfficeLocation: "",
        },
    });

    useEffect(() => {
        if (!targetProfile) return;

        if (targetProfile.accountType === 'brand') {
            brandForm.reset({
                isLegalEntity: targetProfile.isLegalEntity === true,
                nameLegal: targetProfile.nameLegal || "",
                incorporationDate: targetProfile.dateEstablished ? targetProfile.dateEstablished.slice(0, 10) : "",
                headOfficeLocation: targetProfile.headOfficeLocation || "",
            });
        } else {
            individualForm.reset({
                nameFirst: targetProfile.nameFirst || "",
                nameMiddle: targetProfile.nameMiddle || "",
                nameLast: targetProfile.nameLast || "",
            });
        }

        setLoading(false);
    }, [targetProfile, individualForm, brandForm]);

    async function onIndividualSubmit(data: IndividualLegalFormValues) {
        if (!targetAccountId) {
            toast({ variant: "destructive", title: "Error", description: "Not authenticated." });
            return;
        }

        const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
        const result = await updateUserProfile(targetAccountId, data, locationString);

        if (result.success) {
            toast({ title: "Success", description: "Legal name updated successfully.", className: "bg-accent text-accent-foreground" });
            selectedProfile ? await refreshSelectedProfile() : refetch();
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }

    async function onBrandSubmit(data: BrandLegalFormValues) {
        if (!targetAccountId) {
            toast({ variant: "destructive", title: "Error", description: "Not authenticated." });
            return;
        }

        const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
        const result = await updateBrandLegalProfile(targetAccountId, {
            isLegalEntity: data.isLegalEntity,
            nameLegal: data.nameLegal,
            dateEstablished: data.incorporationDate ? new Date(`${data.incorporationDate}T00:00:00`) : undefined,
            headOfficeLocation: data.headOfficeLocation,
        }, locationString);

        if (result.success) {
            toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
            selectedProfile ? await refreshSelectedProfile() : refetch();
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    if (loading || loadingSelectedProfile) {
        return <Skeleton className="h-64 w-full" />
    }

    const isBrandAccount = targetProfile?.accountType === 'brand';
    const isLegalEntity = brandForm.watch('isLegalEntity');

    return (
         <div className="space-y-8">
            <BackButton href={profileBackHref} />

            {isBrandAccount ? (
                <Form {...brandForm}>
                    <form onSubmit={brandForm.handleSubmit(onBrandSubmit)} className="space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Brand Legal Information</CardTitle>
                                <CardDescription>Manage the legal identity details used for this brand account.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <FormField
                                    control={brandForm.control}
                                    name="isLegalEntity"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                            <FormControl>
                                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel>This brand is a legal entity</FormLabel>
                                                <FormMessage />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                {isLegalEntity && (
                                    <div className="space-y-4">
                                        <FormField
                                            control={brandForm.control}
                                            name="nameLegal"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Legal Name</FormLabel>
                                                    <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={brandForm.control}
                                            name="incorporationDate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Incorporation Date</FormLabel>
                                                    <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={brandForm.control}
                                            name="headOfficeLocation"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Organization Head Office Location</FormLabel>
                                                    <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        <div className="flex justify-end">
                            <Button type="submit" disabled={brandForm.formState.isSubmitting}>
                                {brandForm.formState.isSubmitting ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </form>
                </Form>
            ) : (
                <Form {...individualForm}>
                    <form onSubmit={individualForm.handleSubmit(onIndividualSubmit)} className="space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Legal Name</CardTitle>
                                <CardDescription>Manage your legal first, middle, and last name.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={individualForm.control} name="nameFirst" render={({ field }) => ( <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={individualForm.control} name="nameMiddle" render={({ field }) => ( <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={individualForm.control} name="nameLast" render={({ field }) => ( <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            </CardContent>
                        </Card>
                        <div className="flex justify-end">
                            <Button type="submit" disabled={individualForm.formState.isSubmitting}>
                                {individualForm.formState.isSubmitting ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </form>
                </Form>
            )}
        </div>
    )
}
