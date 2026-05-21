'use client';

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NProgress from 'nprogress';
import { format } from "date-fns";

import { useToast } from "@/core/hooks/use-toast";
import { 
    submitNameStep, 
    getSignupStepData, 
    submitDemographicsStep, 
    submitNationalityStep, 
    submitContactStep, 
    submitOtpStep, 
    submitNeupIdStep, 
    submitPasswordStep, 
    submitTermsStep 
} from "@/services/auth/signup";
import { handleAuthRequest } from "@/app/auth/handleAuthRequest";
import { parseDateString } from "@/services/profile";
import { 
    nameSchema, 
    demographicsSchema, 
    nationalitySchema, 
    contactSchema, 
    otpSchema, 
    neupidSchema, 
    passwordSchema, 
    termsSchema 
} from "@/services/auth/signup/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "@/components/icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries } from "./countries";
import { redirectInApp } from "@/services/navigation";
import { appendAuthCallbackContext, hasAuthCallbackContext, shouldReturnToAuthStartForExternalAuthentication, getFlowParams } from "@/core/auth/callback";

const SIGNUP_TIMEOUT_DESCRIPTION = 'Exceeded the time for SignUp.';

function getSignupErrorToast(error?: string) {
    const timeout = Boolean(error && error.includes(SIGNUP_TIMEOUT_DESCRIPTION));
    return {
        title: timeout ? 'Timeout Error' : 'Error',
        description: timeout ? SIGNUP_TIMEOUT_DESCRIPTION : error,
    };
}

// --- Components ---

function NameStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [showMiddleName, setShowMiddleName] = useState(false);
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof nameSchema>>({
        resolver: zodResolver(nameSchema),
        defaultValues: {
            firstName: "",
            middleName: "",
            lastName: "",
        },
    });

    useEffect(() => {
        const initFlow = async () => {
            try {
                let requestId = (
                    await handleAuthRequest({
                        flowType: 'signup',
                        clearSessionKeys: ['temp_user_info'],
                    })
                ).requestId;
                setAuthRequestId(requestId);

                let stepData = await getSignupStepData(requestId);
                if (!stepData.success) {
                    requestId = (
                        await handleAuthRequest({
                            flowType: 'signup',
                            clearSessionKeys: ['temp_user_info'],
                            forceNew: true,
                        })
                    ).requestId;
                    setAuthRequestId(requestId);
                    stepData = await getSignupStepData(requestId);
                }
                const { data } = stepData;
                if (data) {
                    form.reset({
                        firstName: data.nameFirst || "",
                        middleName: data.nameMiddle || "",
                        lastName: data.nameLast || "",
                    });
                    if (data.nameMiddle) {
                        setShowMiddleName(true);
                    }
                }
            } catch (error) {
                console.error("Failed to initialize signup flow", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to initialize session. Please refresh.' });
                return;
            }

            const firstName = searchParams.get('firstName');
            const lastName = searchParams.get('lastName');
            if (firstName) form.setValue('firstName', firstName);
            if (lastName) form.setValue('lastName', lastName);
        };
        initFlow();
    }, [router, form, toast, searchParams]);

    const onSubmit = async (data: z.infer<typeof nameSchema>) => {
        const currentId = authRequestId || sessionStorage.getItem('AuthSessionRequest');
        if (!currentId) {
            toast({ title: 'Please wait...', description: 'Initializing secure session.' });
            return;
        }

        NProgress.start();
        const result = await submitNameStep(currentId, data);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'demographics');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} disabled={isSubmitting} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                {!showMiddleName && (
                    <div className="flex items-center space-x-2">
                        <Checkbox id="hasMiddleName" onCheckedChange={(checked) => setShowMiddleName(!!checked)} disabled={isSubmitting} />
                        <Label htmlFor="hasMiddleName" className="font-normal cursor-pointer">I have a middle name</Label>
                    </div>
                )}

                {showMiddleName && (
                    <FormField control={form.control} name="middleName" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Middle Name</FormLabel>
                            <FormControl><Input {...field} disabled={isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}

                <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} disabled={isSubmitting} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Next
                </Button>
            </form>
        </Form>
    );
}

function DemographicsStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [dateInput, setDateInput] = useState<string>('');
    const [isParsingDate, setIsParsingDate] = useState(false);
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof demographicsSchema>>({
        resolver: zodResolver(demographicsSchema),
        defaultValues: {
            customGender: "",
        },
    });
    
    const genderValue = form.watch("gender");
    
    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);

        async function loadData() {
            const { data } = await getSignupStepData(id || '');
            
            const birthdateParam = searchParams.get('birthdate');
            const genderParam = searchParams.get('gender');

            if (data) {
                const formGender = data.gender;
                let formCustomGender = data.customGender || "";
                
                let dobDate: Date | undefined;
                
                // Prioritize query param if available, otherwise use stored data
                const dateSource = birthdateParam || data.dateBirth;

                if (dateSource) {
                     // Check if it's a string (YYYY-MM-DD) or ISO string
                     if (typeof dateSource === 'string') {
                         if (dateSource.includes('T')) {
                             dobDate = new Date(dateSource);
                         } else {
                             // Handle YYYYMMDD format
                             if (/^\d{8}$/.test(dateSource)) {
                                 const y = dateSource.substring(0, 4);
                                 const m = dateSource.substring(4, 6);
                                 const d = dateSource.substring(6, 8);
                                 dobDate = new Date(`${y}-${m}-${d}T12:00:00`);
                             } else {
                                 dobDate = new Date(dateSource + 'T12:00:00');
                             }
                         }
                     } else {
                         dobDate = new Date(dateSource);
                     }
                }
                
                if (dobDate && !isNaN(dobDate.getTime())) {
                    setDateInput(format(dobDate, 'yyyy-MM-dd'));
                }

                // Prioritize query param for gender
                let finalGender: "male" | "female" | "prefer_not_to_say" | "custom" | undefined;
                
                if (genderParam) {
                    const normalizedGender = genderParam.toLowerCase();
                    if (["male", "female", "prefer_not_to_say"].includes(normalizedGender)) {
                         finalGender = normalizedGender as "male" | "female" | "prefer_not_to_say";
                    } else {
                         finalGender = "custom";
                         formCustomGender = genderParam;
                    }
                } else if (formGender) {
                     // If from DB and no query param override
                     // We need to type check this string
                     if (formGender === "male" || formGender === "female" || formGender === "prefer_not_to_say" || formGender === "custom") {
                        finalGender = formGender;
                     }
                }

                form.reset({
                    dob: dobDate,
                    gender: finalGender,
                    customGender: formCustomGender,
                });
            } else if (birthdateParam || genderParam) {
                 // Fallback if no data stored but params exist
                 let dobDate: Date | undefined;
                 if (birthdateParam) {
                     if (/^\d{8}$/.test(birthdateParam)) {
                         const y = birthdateParam.substring(0, 4);
                         const m = birthdateParam.substring(4, 6);
                         const d = birthdateParam.substring(6, 8);
                         dobDate = new Date(`${y}-${m}-${d}T12:00:00`);
                         if (!isNaN(dobDate.getTime())) {
                             setDateInput(format(dobDate, 'yyyy-MM-dd'));
                         }
                     }
                 }
                 
                 const formGender = genderParam?.toLowerCase();
                 let formCustomGender = "";
                 
                 let finalGender: "male" | "female" | "prefer_not_to_say" | "custom" | undefined;

                 if (formGender) {
                    if (["male", "female", "prefer_not_to_say"].includes(formGender)) {
                        finalGender = formGender as "male" | "female" | "prefer_not_to_say";
                    } else {
                        formCustomGender = genderParam || ""; // use original casing for custom value
                        finalGender = "custom";
                    }
                 }

                 form.reset({
                    dob: dobDate,
                    gender: finalGender,
                    customGender: formCustomGender
                 });
            }
        }
        loadData();
    }, [router, form, searchParams]);

    const handleDateInputBlur = async () => {
        if (!dateInput) return;
        if (dateInput.length > 30) {
            form.setError("dob", { type: "manual", message: "Input must be 30 characters or less." });
            return;
        }

        // Auto-format simplistic inputs like 20220122 -> 2022-01-22
        let formattedInput = dateInput;
        if (/^\d{8}$/.test(dateInput)) {
            formattedInput = `${dateInput.substring(0, 4)}-${dateInput.substring(4, 6)}-${dateInput.substring(6, 8)}`;
            setDateInput(formattedInput);
        }

        const currentDate = form.getValues("dob");
        if (currentDate && formattedInput === format(currentDate, 'yyyy-MM-dd')) {
            form.clearErrors('dob');
            return;
        }

        setIsParsingDate(true);
        form.clearErrors('dob');
        const result = await parseDateString(formattedInput);
        setIsParsingDate(false);

        if (result.success && result.date) {
            // Use T12:00:00 to avoid midnight DST issues where 00:00:00 might not exist
            const newDate = new Date(result.date + 'T12:00:00');
            if (isNaN(newDate.getTime())) {
                form.setError('dob', { type: 'manual', message: 'Invalid date provided.' });
                return;
            }
            form.setValue('dob', newDate, { shouldDirty: true, shouldValidate: true });
            setDateInput(format(newDate, 'yyyy-MM-dd'));
        } else {
            form.setError('dob', { type: 'manual', message: 'Invalid date provided.' });
        }
    };

    const onSubmit = async (data: z.infer<typeof demographicsSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        
        // Convert Date to YYYY-MM-DD string to preserve local date and avoid UTC shifting
        const payload = {
            ...data,
            dob: data.dob instanceof Date ? format(data.dob, 'yyyy-MM-dd') : data.dob
        };

        const result = await submitDemographicsStep(authRequestId, payload);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'nationality');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;
    
    const genderOptions = ["Male", "Female", "Prefer not to say", "Custom"];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                    className="block"
                                >
                                    <div className="border border-input rounded-lg overflow-hidden">
                                    {genderOptions.map((option) => {
                                        const value = option.toLowerCase().replace(/\s/g, '_');
                                        return (
                                            <FormItem key={value} className="m-0">
                                                <Label htmlFor={`gender-${value}`} className="flex items-center space-x-3 space-y-0 p-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-input last:border-b-0 has-[input:checked]:bg-primary/10">
                                                    <div className="relative flex items-center">
                                                        <RadioGroupItem value={value} id={`gender-${value}`} className="peer sr-only" />
                                                            <div className="w-5 h-5 border-2 border-primary rounded-sm flex-shrink-0 peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-white flex items-center justify-center">
                                                            <Check className="h-4 w-4 opacity-0 peer-data-[state=checked]:opacity-100" />
                                                        </div>
                                                    </div>
                                                    <span className="ml-3 font-normal">{option}</span>
                                                </Label>
                                            </FormItem>
                                        );
                                    })}
                                    </div>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                {genderValue === 'custom' && (
                    <FormField
                        control={form.control}
                        name="customGender"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Custom Gender</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="Please specify" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                 <FormField
                    control={form.control}
                    name="dob"
                    render={() => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Date of birth</FormLabel>
                            <div className="relative w-full">
                                <Input
                                    placeholder="YYYY-MM-DD or e.g. June 12 2002"
                                    value={dateInput}
                                    onChange={(e) => setDateInput(e.target.value)}
                                    onBlur={handleDateInputBlur}
                                    disabled={isParsingDate || isSubmitting}
                                    className="pr-10"
                                />
                                {isParsingDate && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                            </div>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Next
                </Button>
            </form>
        </Form>
    );
}

function NationalityStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof nationalitySchema>>({
        resolver: zodResolver(nationalitySchema),
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);

        async function loadData() {
            const { data } = await getSignupStepData(id || '');
            if (data?.nationality) {
                form.setValue("nationality", data.nationality);
            }
        }
        loadData();
    }, [router, form]);

    const onSubmit = async (data: z.infer<typeof nationalitySchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitNationalityStep(authRequestId, data);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'contact');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="nationality"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nationality</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select your country" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {countries.map(country => (
                                        <SelectItem key={country.code} value={country.name}>
                                            {country.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Next
                </Button>
            </form>
        </Form>
    );
}

function ContactStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof contactSchema>>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            phone: "",
        },
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);

        async function loadData() {
            const { data } = await getSignupStepData(id || '');
            if (data?.phone) {
                form.setValue("phone", data.phone);
            }
        }
        loadData();
    }, [router, form]);

    const onSubmit = async (data: z.infer<typeof contactSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitContactStep(authRequestId, data);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'neupid');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl><Input type="tel" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                </Button>
            </form>
        </Form>
    );
}

function OtpStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof otpSchema>>({
        resolver: zodResolver(otpSchema),
        defaultValues: {
            code: "",
        },
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);
    }, [router]);

    const onSubmit = async (data: z.infer<typeof otpSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitOtpStep(authRequestId, data);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'neupid');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="code" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Verification Code</FormLabel>
                        <FormControl><Input {...field} maxLength={6} autoComplete="one-time-code" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify and Continue
                </Button>
            </form>
        </Form>
    );
}

function NeupIdStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof neupidSchema>>({
        resolver: zodResolver(neupidSchema),
        defaultValues: {
            neupId: "",
        },
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);

        async function loadData() {
            const { data } = await getSignupStepData(id || '');
            if (data?.neupId) {
                form.setValue("neupId", data.neupId);
            }
        }
        loadData();
    }, [router, form]);

    const onSubmit = async (data: z.infer<typeof neupidSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitNeupIdStep(authRequestId, data);
        if (result.success) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'password');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="neupId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Choose your NeupID</FormLabel>
                        <FormControl><Input {...field} autoComplete="username" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Next
                </Button>
            </form>
        </Form>
    );
}

function PasswordStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: {
            password: "",
        },
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);
    }, [router]);

    const onSubmit = async (data: z.infer<typeof passwordSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitPasswordStep(authRequestId, data);
        if (result.success) {
            if (shouldReturnToAuthStartForExternalAuthentication(searchParams)) {
                redirectInApp(router, appendAuthCallbackContext('/auth/start', searchParams));
                return;
            }

            const params = new URLSearchParams(searchParams.toString());
            params.set('step', 'terms');
            redirectInApp(router, `/auth/signup?${params.toString()}`);
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Create a Password</FormLabel>
                        <FormControl><Input type="password" {...field} autoComplete="new-password" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Next
                </Button>
            </form>
        </Form>
    );
}

function TermsStep() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authRequestId, setAuthRequestId] = useState<string | null>(null);

    const form = useForm<z.infer<typeof termsSchema>>({
        resolver: zodResolver(termsSchema),
        defaultValues: {
            agreement: false,
        },
    });

    useEffect(() => {
        const id = sessionStorage.getItem('AuthSessionRequest');
        if (!id) {
            redirectInApp(router, '/auth/signup');
            return;
        }
        setAuthRequestId(id);
    }, [router]);

    const onSubmit = async (data: z.infer<typeof termsSchema>) => {
        if (!authRequestId) {
            toast({ variant: 'destructive', title: 'Timeout Error', description: SIGNUP_TIMEOUT_DESCRIPTION });
            return;
        }
        NProgress.start();
        const result = await submitTermsStep(authRequestId, data);
        if (result.success) {
            sessionStorage.clear();
            
            // Check if backsTo exists - if so, use that as the redirect
            const flowParams = getFlowParams(searchParams);
            if (flowParams.backsTo) {
                redirectInApp(router, flowParams.backsTo);
                return;
            }

            const redirects = searchParams.get('redirects');
            if (redirects) {
                redirectInApp(router, redirects);
                return;
            }

            if (hasAuthCallbackContext(searchParams)) {
                const params = new URLSearchParams(searchParams.toString());
                params.delete('step');
                params.set('step', 'access');
                redirectInApp(router, `/auth/sign?${params.toString()}`);
                return;
            }

            redirectInApp(router, '/');
        } else {
            const toastError = getSignupErrorToast(result.error);
            toast({ variant: 'destructive', title: toastError.title, description: toastError.description });
            NProgress.done();
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="agreement"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    I agree to the terms and conditions.
                                </FormLabel>
                                <FormMessage />
                            </div>
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                </Button>
            </form>
        </Form>
    );
}

// --- Main Page ---

function SignupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = searchParams.get('step');

  useEffect(() => {
    const startFlow = async () => {
      try {
        const params = new URLSearchParams(searchParams.toString());

        // Always normalize signup to first step and remove signin-like carryover params.
        if (step && step !== 'name') {
          sessionStorage.removeItem('AuthSessionRequest');
          sessionStorage.removeItem('temp_user_info');
        }
        params.delete('neupId');
        params.delete('neupid');
        params.set('step', 'name');

        await handleAuthRequest({
          flowType: 'signup',
          clearSessionKeys: ['temp_user_info'],
        });

        if (searchParams.get('step') !== 'name' || searchParams.get('neupId') || searchParams.get('neupid')) {
          redirectInApp(router, `/auth/signup?${params.toString()}`);
        }
      } catch (error) {
        console.error('Failed to initialize signup flow:', error);
      }
    };

    void startFlow();
  }, [step, router, searchParams]);

  if (!step) return null; // Or a loading spinner

  switch (step) {
    case 'name': return <NameStep />;
    case 'demographics': return <DemographicsStep />;
    case 'nationality': return <NationalityStep />;
    case 'contact': return <ContactStep />;
    case 'otp': return <OtpStep />;
    case 'neupid': return <NeupIdStep />;
    case 'password': return <PasswordStep />;
    case 'terms': return <TermsStep />;
    default: return <NameStep />;
  }
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupFlow />
    </Suspense>
  )
}
