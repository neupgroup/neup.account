

"use client"

import { useEffect, useState, useContext } from 'react'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"

import { getUserProfile, type UserProfile } from '@/services/user'
import { parseDateString, updateBrandProfile } from "@/services/profile"
import { brandProfileFormSchema } from "@/services/profile/schema"
import { useToast } from "@/core/hooks/use-toast"
import { cn } from "@/core/helpers/utils"

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Geolocation } from '@/core/providers/geolocation'
import { Loader2 } from '@/components/icons'

type BrandFormValues = z.infer<typeof brandProfileFormSchema>;

export function BrandProfileForm({ accountId, children }: { accountId: string, children: React.ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const geo = useContext(Geolocation);
    const [dateInput, setDateInput] = useState<string>('');
    const [isParsingDate, setIsParsingDate] = useState(false);

    const form = useForm<BrandFormValues>({
        resolver: zodResolver(brandProfileFormSchema),
        defaultValues: {
            nameDisplay: "",
            accountPhoto: "",
            isLegalEntity: false,
            nameLegal: "",
            registrationId: "",
            countryOfOrigin: "",
        },
    });

    const isLegalEntity = form.watch("isLegalEntity");

    useEffect(() => {
        if (!accountId) return;

        const fetchData = async () => {
            try {
                const profileData = await getUserProfile(accountId);

                if (profileData) {
                    const estDate = profileData.dateEstablished ? new Date(profileData.dateEstablished) : undefined;
                    if(estDate) {
                        setDateInput(format(estDate, 'yyyy-MM-dd'));
                    }
                    form.reset({
                        nameDisplay: profileData.nameDisplay || "",
                        accountPhoto: profileData.accountPhoto || "",
                        isLegalEntity: profileData.isLegalEntity || false,
                        nameLegal: profileData.nameLegal || "",
                        registrationId: profileData.registrationId || "",
                        countryOfOrigin: profileData.countryOfOrigin || "",
                        dateEstablished: estDate,
                    });
                } else {
                    setError("Could not load brand profile data.");
                }
            } catch (e) {
                console.error(e);
                setError("An error occurred while fetching brand data.");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [accountId, form]);

    const handleDateInputBlur = async () => {
        if (!dateInput) return;

        if (dateInput.length > 30) {
            form.setError("dateEstablished", { type: "manual", message: "Input must be 30 characters or less." });
            return;
        }

        const currentDate = form.getValues("dateEstablished");
        if (currentDate && dateInput === format(currentDate, 'yyyy-MM-dd')) {
            form.clearErrors('dateEstablished');
            return;
        }

        setIsParsingDate(true);
        form.clearErrors('dateEstablished');
        const result = await parseDateString(dateInput);
        setIsParsingDate(false);

        if (result.success && result.date) {
            const newDate = new Date(result.date + 'T00:00:00');
            form.setValue('dateEstablished', newDate, { shouldDirty: true, shouldValidate: true });
            setDateInput(format(newDate, 'yyyy-MM-dd'));
        } else {
            form.setError('dateEstablished', { type: 'manual', message: result.error || 'Invalid date format.' });
        }
    };
    
    async function onSubmit(data: BrandFormValues) {
        const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
        const result = await updateBrandProfile(accountId, data, locationString);
        if (result.success) {
            toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
        } else {
            let description = result.error;
            if (result.details) {
                description = Object.values(result.details.fieldErrors).flat().join(' | ');
            }
            toast({ variant: "destructive", title: "Error", description: description || "An error occurred." });
        }
    }

    if (loading) {
        return (
            <Card>
                <CardHeader><CardTitle>Brand Information</CardTitle><CardDescription>Manage your brand's public profile.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-10 w-1/3" />
                    <Skeleton className="h-10 w-2/3" />
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return <Card><CardHeader><CardTitle>Error</CardTitle></CardHeader><CardContent><p className="text-destructive">{error}</p></CardContent></Card>
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card className="bg-card/50 shadow-none">
                    <CardHeader>
                        <CardTitle>Brand Information</CardTitle>
                        <CardDescription>Manage your brand's public display name and logo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-6">
                            <div className="flex-shrink-0">
                                <Label>Logo</Label>
                                <Avatar className="h-24 w-24 mt-2 rounded-lg">
                                    <AvatarImage src={form.watch('accountPhoto') || undefined} alt="Brand Logo" data-ai-hint="logo" />
                                    <AvatarFallback className="rounded-lg" />
                                </Avatar>
                            </div>
                            <div className="flex-grow space-y-4">
                                <FormField
                                    control={form.control}
                                    name="nameDisplay"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Display Name</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="accountPhoto"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Logo URL</FormLabel>
                                            <FormControl><Input placeholder="https://..." {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 shadow-none">
                    <CardHeader>
                        <CardTitle>Legal Information</CardTitle>
                        <CardDescription>Provide legal details if your brand is a registered entity.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="isLegalEntity"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 cursor-pointer">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel className="cursor-pointer">This is a registered legal entity</FormLabel>
                                        <FormMessage />
                                    </div>
                                </FormItem>
                            )}
                        />

                        {isLegalEntity && (
                            <div className="grid md:grid-cols-2 gap-4 pt-4">
                                <FormField
                                    control={form.control}
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
                                    control={form.control}
                                    name="registrationId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Registration Number</FormLabel>
                                            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="countryOfOrigin"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Country of Origin</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="Select a country" /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="USA">United States</SelectItem>
                                                    <SelectItem value="CAN">Canada</SelectItem>
                                                    <SelectItem value="GBR">United Kingdom</SelectItem>
                                                    <SelectItem value="AUS">Australia</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="dateEstablished"
                                    render={() => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Established On</FormLabel>
                                        <div className="relative w-full">
                                            <Input
                                                placeholder="YYYY-MM-DD or e.g. June 12 2002"
                                                value={dateInput}
                                                onChange={(e) => setDateInput(e.target.value)}
                                                onBlur={handleDateInputBlur}
                                                disabled={isParsingDate}
                                                className="pr-10"
                                            />
                                            {isParsingDate && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
