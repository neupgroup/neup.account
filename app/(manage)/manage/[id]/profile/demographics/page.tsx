"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"

import { getUserProfile } from '@/services/user'
import { updateUserProfile, parseDateString } from "@/services/profile"
import { useToast } from "@/neup.core/hooks/use-toast"
import { cn } from '@/neup.core/helpers/utils'

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from '@/components/ui/label'
import { Loader2 } from "@/components/icons"
import { BackButton } from '@/components/ui/back-button'
import { PrimaryHeader } from '@/components/ui/primary-header'

const demographicsFormSchema = z.object({
    gender: z.enum(["male", "female", "custom", "prefer_not_to_say"]),
    customGender: z.string().optional(),
    dateBirth: z.date({ required_error: "A date of birth is required." }).optional(),
});

type DemographicsFormValues = z.infer<typeof demographicsFormSchema>;

export default function RootUserDemographicsPage() {
    const params = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [profile, setProfile] = useState<any>(null);

    const [dateInput, setDateInput] = useState<string>('');
    const [isParsingDate, setIsParsingDate] = useState(false);

    const form = useForm<DemographicsFormValues>({
        resolver: zodResolver(demographicsFormSchema),
        defaultValues: {
            gender: "prefer_not_to_say",
            customGender: "",
        },
    });

    useEffect(() => {
        const fetchData = async () => {
            const profileData = await getUserProfile(params.id);
            if(profileData) {
                setProfile(profileData);
                let formGender = profileData.gender || 'prefer_not_to_say';
                let formCustomGender = "";
                if (formGender.startsWith('c.')) {
                    formCustomGender = formGender.substring(2);
                    formGender = 'custom';
                }
                const dobDate = profileData.dateBirth ? new Date(profileData.dateBirth) : undefined;
                if (dobDate) {
                     setDateInput(format(dobDate, 'yyyy-MM-dd'));
                }
                form.reset({
                    gender: formGender as "male" | "female" | "custom" | "prefer_not_to_say",
                    customGender: formCustomGender,
                    dateBirth: dobDate,
                });
            }
            setLoading(false);
        }
        fetchData();
    }, [params.id, form]);

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



    async function onSubmit(data: DemographicsFormValues) {
        let finalGender = data.gender;
        if (data.gender === 'custom') {
            finalGender = `c.${data.customGender?.trim() || 'custom'}` as any;
        }

        const result = await updateUserProfile(params.id, { ...data, gender: finalGender });

        if (result.success) {
            toast({ title: "Success", description: "Demographics updated successfully.", className: "bg-accent text-accent-foreground" });
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
                title="Demographics"
                description={`Update gender and date of birth for @${profile.neupIdPrimary}.`}
            />
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Demographics</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="gender"
                                render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Gender</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                                            <FormItem><RadioGroupItem value="male" id="gender-male" className="peer sr-only" /><Label htmlFor="gender-male" className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary">Male</Label></FormItem>
                                            <FormItem><RadioGroupItem value="female" id="gender-female" className="peer sr-only" /><Label htmlFor="gender-female" className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary">Female</Label></FormItem>
                                            <FormItem><RadioGroupItem value="prefer_not_to_say" id="gender-pnts" className="peer sr-only" /><Label htmlFor="gender-pnts" className="flex h-full cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary">Prefer not to say</Label></FormItem>
                                            <FormItem>
                                                <RadioGroupItem value="custom" id="gender-custom" className="peer sr-only" />
                                                <Label htmlFor="gender-custom" className={cn( "flex h-full cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-4 font-normal hover:bg-accent hover:text-accent-foreground", field.value === 'custom' && "border-primary" )}>
                                                    <span>Custom</span>
                                                    {field.value === 'custom' && (
                                                        <FormField
                                                            control={form.control}
                                                            name="customGender"
                                                            render={({ field: customField }) => (
                                                                <Input {...customField} value={customField.value ?? ''} placeholder="Specify" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="ml-2 h-8 w-auto flex-grow" />
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
                                            disabled={isParsingDate || form.formState.isSubmitting}
                                            className="pr-10"
                                        />
                                        {isParsingDate && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
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