"use client"

import { useEffect, useState, useContext } from 'react'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { getUserProfile, getUserNeupIds, getUserContacts, type UserProfile, type UserContacts } from '@/services/user'
import { updateUserProfile, parseDateString } from "@/services/profile"
import { profileFormSchema } from "@/services/profile/schema"
import { useToast } from "@/core/hooks/use-toast"
import { cn } from "@/core/utils"

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Geolocation } from '@/core/providers/geolocation'
import { Loader2 } from '@/components/icons'

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function IndividualProfileForm({ accountId }: { accountId: string }) {
    const [neupIds, setNeupIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast()
    const geo = useContext(Geolocation);

    const [dateInput, setDateInput] = useState<string>('');
    const [isParsingDate, setIsParsingDate] = useState(false);
    const [isPro, setIsPro] = useState(false);


    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            nameFirst: "",
            nameMiddle: "",
            nameLast: "",
            nameDisplay: "",
            accountPhoto: "",
            gender: "prefer_not_to_say",
            customGender: "",
            primaryPhone: "",
            secondaryPhone: "",
            permanentLocation: "",
            currentLocation: "",
            newNeupIdRequest: "",
        },
    });

    useEffect(() => {
        if (!accountId) return;

        const fetchData = async () => {
            try {
                const [profileData, neupIdsData, contactsData] = await Promise.all([
                    getUserProfile(accountId),
                    getUserNeupIds(accountId),
                    getUserContacts(accountId),
                ]);

                if (profileData) {
                    setIsPro(profileData.pro === true);
                    let formGender = profileData.gender || 'prefer_not_to_say';
                    let formCustomGender = "";

                    if (formGender.startsWith('c.')) {
                        formCustomGender = formGender.substring(2);
                        formGender = 'custom';
                    }
                    
                    const dobDate = profileData.dateBirth ? new Date(profileData.dateBirth) : undefined;
                    const defaultDisplayName = profileData.nameDisplay || `${profileData.nameFirst || ''} ${profileData.nameLast || ''}`.trim();

                    form.reset({
                        nameFirst: profileData.nameFirst || "",
                        nameMiddle: profileData.nameMiddle || "",
                        nameLast: profileData.nameLast || "",
                        nameDisplay: defaultDisplayName,
                        accountPhoto: profileData.accountPhoto || "",
                        gender: formGender as "male" | "female" | "custom" | "prefer_not_to_say",
                        customGender: formCustomGender,
                        dateBirth: dobDate,
                        primaryPhone: contactsData.primaryPhone || "",
                        secondaryPhone: contactsData.secondaryPhone || "",
                        permanentLocation: contactsData.permanentLocation || "",
                        currentLocation: contactsData.currentLocation || "",
                        newNeupIdRequest: "",
                    });
                    
                    if (dobDate && !isNaN(dobDate.getTime())) {
                        setDateInput(format(dobDate, 'yyyy-MM-dd'));
                    }

                } else {
                    setError("Could not load profile data.");
                }
                setNeupIds(neupIdsData);

            } catch (e) {
                console.error(e);
                setError("An error occurred while fetching your data.");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]);

    const handleDateInputBlur = async () => {
        if (!dateInput) return;

        if (dateInput.length > 30) {
            form.setError("dateBirth", { type: "manual", message: "Input must be 30 characters or less." });
            return;
        }

        const currentDate = form.getValues("dateBirth");
        if (currentDate && dateInput === format(currentDate, 'yyyy-MM-dd')) {
            form.clearErrors('dateBirth');
            return;
        }

        setIsParsingDate(true);
        form.clearErrors('dateBirth');
        const result = await parseDateString(dateInput);
        setIsParsingDate(false);

        if (result.success && result.date) {
            const newDate = new Date(result.date + 'T00:00:00');
            form.setValue('dateBirth', newDate, { shouldDirty: true, shouldValidate: true });
            setDateInput(format(newDate, 'yyyy-MM-dd'));
        } else {
            form.setError('dateBirth', { type: 'manual', message: result.error || 'Invalid date format.' });
        }
    };



    async function onSubmit(data: ProfileFormValues) {
        if (!accountId) {
            toast({ variant: "destructive", title: "Error", description: "Could not find user account. Please log in again." });
            return;
        }
        
        const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
        const result = await updateUserProfile(accountId, data, locationString);

        if (result.success) {
            toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
            form.reset({ ...form.getValues(), newNeupIdRequest: "" });
            // Optimistically update NeupIDs if a request was made
            if (data.newNeupIdRequest) {
                setNeupIds(prev => [...prev, `${data.newNeupIdRequest} (pending)`])
            }
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    const neupIdLimit = isPro ? 2 : 1;
    const canRequestNeupId = neupIds.length < neupIdLimit;

    if (loading) {
        return (
            <Card>
                <CardHeader><CardTitle>Personal Information</CardTitle><CardDescription>Your personal and account details.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-10 w-1/3" />
                    <Skeleton className="h-10 w-2/3" />
                </CardContent>
            </Card>
        )
    }
    
    if(error){
        return <Card><CardHeader><CardTitle>Error</CardTitle></CardHeader><CardContent><p className="text-destructive">{error}</p></CardContent></Card>
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card className="bg-card/50 shadow-none">
                    <CardHeader>
                        <CardTitle>Personal Information</CardTitle>
                        <CardDescription>Manage your personal details like name and date of birth.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <FormField control={form.control} name="nameFirst" render={({ field }) => ( <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="nameMiddle" render={({ field }) => ( <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="nameLast" render={({ field }) => ( <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField
                                control={form.control}
                                name="gender"
                                render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Gender</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            value={field.value}
                                            className="grid grid-cols-2 gap-4"
                                        >
                                            <FormItem>
                                                <RadioGroupItem value="male" id="gender-male" className="peer sr-only" />
                                                <Label
                                                    htmlFor="gender-male"
                                                    className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary"
                                                >
                                                    Male
                                                </Label>
                                            </FormItem>
                                            <FormItem>
                                                <RadioGroupItem value="female" id="gender-female" className="peer sr-only" />
                                                <Label
                                                    htmlFor="gender-female"
                                                    className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary"
                                                >
                                                    Female
                                                </Label>
                                            </FormItem>
                                            <FormItem>
                                                <RadioGroupItem value="prefer_not_to_say" id="gender-pnts" className="peer sr-only" />
                                                <Label
                                                    htmlFor="gender-pnts"
                                                    className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary"
                                                >
                                                    Prefer not to say
                                                </Label>
                                            </FormItem>
                                            <FormItem>
                                                <RadioGroupItem value="custom" id="gender-custom" className="peer sr-only" />
                                                <Label
                                                    htmlFor="gender-custom"
                                                    className={cn(
                                                        "flex h-full cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground",
                                                        field.value === 'custom' && "border-primary"
                                                    )}
                                                >
                                                    <span>Custom</span>
                                                    {field.value === 'custom' && (
                                                        <FormField
                                                            control={form.control}
                                                            name="customGender"
                                                            render={({ field: customField }) => (
                                                                <Input
                                                                    {...customField}
                                                                    value={customField.value ?? ''}
                                                                    placeholder="Specify"
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                    className="ml-2 h-8 w-auto flex-grow"
                                                                />
                                                            )}
                                                        />
                                                    )}
                                                </Label>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dateBirth"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Date of birth</FormLabel>
                                    <div className="relative w-full max-w-[240px]">
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
                             )} />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 shadow-none">
                    <CardHeader>
                        <CardTitle>Display Information</CardTitle>
                        <CardDescription>This information will be displayed publicly on your profile.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-6">
                            <div className="flex-shrink-0">
                                <Label>Photo</Label>
                                <Avatar className="h-24 w-24 mt-2 rounded-lg">
                                    <AvatarImage src={form.watch('accountPhoto') || undefined} alt="Display Photo" data-ai-hint="person" />
                                    <AvatarFallback className="rounded-lg">
                                        {`${form.watch('nameFirst')?.[0] || ''}${form.watch('nameLast')?.[0] || ''}`.toUpperCase()}
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
                
                <Card className="bg-card/50 shadow-none">
                    <CardHeader>
                        <CardTitle>NeupID and Identities</CardTitle>
                        <CardDescription>Manage your unique identifiers and request new ones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <div className="space-y-2">
                            <Label>Associated NeupIDs</Label>
                             <div className="flex flex-wrap gap-2">
                                {neupIds.map((id) => (
                                    <Badge key={id} variant="secondary">{id}</Badge>
                                ))}
                            </div>
                        </div>
                        {canRequestNeupId ? (
                            <FormField control={form.control} name="newNeupIdRequest" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Request New NeupID</FormLabel>
                                    <FormControl><Input placeholder="Enter desired NeupID" value={field.value ?? ''} onChange={field.onChange} /></FormControl>
                                    <FormDescription>Your request will be sent for admin approval. You can request up to {neupIdLimit} NeupIDs.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        ) : (
                             <FormItem>
                                <FormLabel>Request New NeupID</FormLabel>
                                <FormControl><Input placeholder="You have reached your NeupID limit" disabled /></FormControl>
                                <FormDescription>Upgrade to Pro to request more NeupIDs, or contact an administrator.</FormDescription>
                            </FormItem>
                        )}
                    </CardContent>
                </Card>


                <Card className="bg-card/50 shadow-none">
                    <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                             <FormField control={form.control} name="primaryPhone" render={({ field }) => ( <FormItem><FormLabel>Primary Phone</FormLabel><FormControl><PhoneInput value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField control={form.control} name="secondaryPhone" render={({ field }) => ( <FormItem><FormLabel>Secondary Phone</FormLabel><FormControl><PhoneInput value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="permanentLocation" render={({ field }) => ( <FormItem><FormLabel>Permanent Location</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="currentLocation" render={({ field }) => ( <FormItem><FormLabel>Current Location</FormLabel><FormControl><Input value={field.value ?? ''} onChange={field.onChange} /></FormControl><FormMessage /></FormItem> )} />
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
    )
}
