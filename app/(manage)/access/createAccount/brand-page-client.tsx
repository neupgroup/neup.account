"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useDebounce } from "use-debounce"

import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
} from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#/components/ui/form"
import { Checkbox } from "#/components/ui/checkbox"
import { useToast } from "#/core/hooks/useToast"
import { createBrandAccount } from "@/services/manage/accounts/brand"
import { Textarea } from "#/components/ui/textarea"
import { CheckCircle2, XCircle, Loader2 } from "@/components/icons"
import { BackButton } from "#/components/ui/back-button"
import { brandCreationSchema } from "@/services/manage/accounts/schema"
import { checkNeupIdAvailability } from '@/services/user'
import { SecondaryHeader } from "#/components/ui/secondary-header"
import { redirectInApp } from "@/.neup/core/helpers/link/navigation";

type FormData = z.infer<typeof brandCreationSchema>;

export default function CreateBrandPageClient({
    managerAccountId,
    backHref,
}: {
    managerAccountId: string;
    backHref: string;
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    const [neupIdStatus, setNeupIdStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');

    const form = useForm<z.infer<typeof brandCreationSchema>>({
        resolver: zodResolver(brandCreationSchema),
        defaultValues: {
            nameBrand: "",
            isLegalEntity: false,
            nameLegal: "",
            registrationId: "",
            hasHeadOffice: false,
            headOfficeLocation: "",
            servingAreas: "",
            neupId: "",
            agreement: false,
        },
    })
    
    const isLegalEntity = form.watch("isLegalEntity")
    const hasHeadOffice = form.watch("hasHeadOffice")
    const neupIdValue = form.watch("neupId");
    const [debouncedValue] = useDebounce(neupIdValue, 500);

    const checkAvailability = useCallback(async (id: string) => {
        if (id.length < 3 || !/^[a-z0-9-]+$/.test(id)) {
            setNeupIdStatus('idle');
            return;
        }
        setNeupIdStatus('checking');
        const { available } = await checkNeupIdAvailability(id);
        setNeupIdStatus(available ? 'available' : 'unavailable');
    }, []);
    
    useEffect(() => {
        checkAvailability(debouncedValue);
    }, [debouncedValue, checkAvailability]);

    
    const handleNeupIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        form.setValue('neupId', value, { shouldValidate: true });
    };

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            const checkResult = await checkNeupIdAvailability(data.neupId);
            if (!checkResult.available) {
                 toast({ variant: "destructive", title: "Creation Failed", description: "The chosen NeupID is not available." });
                 setIsSubmitting(false);
                 return;
            }

            const result = await createBrandAccount(data, managerAccountId);

            if (result.success) {
                toast({ title: "Success", description: "Brand Account created successfully!", className: "bg-accent text-accent-foreground" });
                redirectInApp(router, backHref);
            } else {
                toast({
                    variant: "destructive",
                    title: "Creation Failed",
                    description: result.error || "An unexpected error occurred.",
                });
            }
        } catch (error) {
            console.error("Error creating brand account:", error);
            toast({
                variant: "destructive",
                title: "Creation Failed",
                description: "Could not create your brand account. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const NeupIdStatusIcon = () => {
        if (neupIdStatus === 'checking') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
        if (neupIdStatus === 'available') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
        if (neupIdStatus === 'unavailable') return <XCircle className="h-5 w-5 text-destructive" />;
        return null;
    }

    return (
        <div className="grid gap-8">
            <BackButton href={backHref} />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Create a Brand Account</h1>
                <p className="text-muted-foreground">
                    Fill in the details below to set up a new brand account.
                </p>
            </div>
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <div className="space-y-2">
                        <SecondaryHeader
                            title="Brand Information"
                            description="Provide the basic details for your brand."
                        />
                         <Card>
                            <CardContent className="space-y-6 pt-6">
                                <FormField control={form.control} name="nameBrand" render={({ field }) => ( <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Stark Industries" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="isLegalEntity" render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 cursor-pointer">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="cursor-pointer">This is a registered legal entity</FormLabel>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )} />
                                {isLegalEntity && (
                                    <>
                                        <FormField control={form.control} name="nameLegal" render={({ field }) => ( <FormItem><FormLabel>Legal Name</FormLabel><FormControl><Input placeholder="Stark Industries, LLC" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField control={form.control} name="registrationId" render={({ field }) => ( <FormItem><FormLabel>Registration ID (Optional)</FormLabel><FormControl><Input placeholder="e.g., Business Registration Number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-2">
                        <SecondaryHeader
                            title="Location Information"
                            description="Tell us where your brand operates."
                        />
                        <Card>
                            <CardContent className="space-y-6 pt-6">
                                <FormField control={form.control} name="hasHeadOffice" render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 cursor-pointer">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="cursor-pointer">This brand has a physical head office</FormLabel>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )} />
                                {hasHeadOffice && (
                                    <FormField control={form.control} name="headOfficeLocation" render={({ field }) => ( <FormItem><FormLabel>Head Office Location</FormLabel><FormControl><Input placeholder="e.g., 10880 Malibu Point, 90265" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )} />
                                )}
                                <FormField control={form.control} name="servingAreas" render={({ field }) => ( <FormItem><FormLabel>Serving Areas (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., New York, Tokyo, Global" {...field} value={field.value ?? ''}/></FormControl><FormDescription>Where does this brand operate or serve customers? (Comma-separated)</FormDescription><FormMessage /></FormItem> )} />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-2">
                        <SecondaryHeader
                            title="Choose NeupID"
                            description="This will be the unique public identifier for your brand."
                        />
                        <Card>
                            <CardContent className="space-y-4 pt-6">
                                 <FormField control={form.control} name="neupId" render={({ field }) => ( 
                                    <FormItem>
                                        <FormLabel>NeupID</FormLabel>
                                        <div className="relative">
                                            <FormControl>
                                                <Input 
                                                    placeholder="stark-industries" 
                                                    {...field}
                                                    onChange={handleNeupIdChange}
                                                    className="pr-10"
                                                />
                                            </FormControl>
                                            <div className="absolute inset-y-0 right-3 flex items-center">
                                                <NeupIdStatusIcon />
                                            </div>
                                        </div>
                                        <FormMessage />
                                    </FormItem> 
                                )} />
                            </CardContent>
                        </Card>
                    </div>

                    <FormField
                        control={form.control}
                        name="agreement"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>I confirm I have authority to create this brand account.</FormLabel>
                                    <FormMessage />
                                </div>
                            </FormItem>
                        )}
                    />

                    <Button htmlType="submit" disabled={isSubmitting || neupIdStatus !== 'available'}>
                        {isSubmitting ? "Creating..." : "Create Brand"}
                    </Button>
                </form>
            </Form>
        </div>
    )
}
