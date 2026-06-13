
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useDebounce } from "use-debounce"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/core/hooks/use-toast"
import { createBranchAccount, checkBranchNeupIdAvailability } from "@/services/manage/accounts/branches";
import { CheckCircle2, XCircle, Loader2 } from "@/components/icons"
import { BackButton } from "@/components/ui/back-button"

const formSchema = z.object({
    name: z.string().min(1, "Branch name is required"),
    neupIdSubdomain: z.string()
        .min(3, "Subdomain must be at least 3 characters.")
        .regex(/^[a-z0-9-]+$/, "Subdomain can only contain lowercase letters, numbers, and hyphens."),
    location: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateBranchPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [neupIdStatus, setNeupIdStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
    const [fullNeupIdPreview, setFullNeupIdPreview] = useState<string | null>(null);

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            neupIdSubdomain: "",
            location: "",
        },
    })
    
    const neupIdValue = form.watch("neupIdSubdomain");
    const [debouncedValue] = useDebounce(neupIdValue, 500);

    const checkAvailability = useCallback(async (subdomain: string) => {
        if (subdomain.length < 3 || !/^[a-z0-9-]+$/.test(subdomain)) {
            setNeupIdStatus('idle');
            setFullNeupIdPreview(null);
            return;
        }
        setNeupIdStatus('checking');
        const { available, fullNeupId } = await checkBranchNeupIdAvailability(subdomain);
        setNeupIdStatus(available ? 'available' : 'unavailable');
        setFullNeupIdPreview(fullNeupId || null);
    }, []);
    
    useEffect(() => {
        checkAvailability(debouncedValue);
    }, [debouncedValue, checkAvailability]);

    
    const handleNeupIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        form.setValue('neupIdSubdomain', value, { shouldValidate: true });
    };

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);

        const checkResult = await checkBranchNeupIdAvailability(data.neupIdSubdomain);
        if (!checkResult.available) {
             toast({ variant: "destructive", title: "Creation Failed", description: "The chosen NeupID is not available." });
             setIsSubmitting(false);
             return;
        }

        const result = await createBranchAccount(data);

        if (result.success) {
            toast({ title: "Success", description: "Branch Account created successfully!", className: "bg-accent text-accent-foreground" });
            router.back();
            router.refresh();
        } else {
            toast({
                variant: "destructive",
                title: "Creation Failed",
                description: result.error || "An unexpected error occurred.",
            });
        }
        setIsSubmitting(false);
    }

    const NeupIdStatusIcon = () => {
        if (neupIdStatus === 'checking') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
        if (neupIdStatus === 'available') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
        if (neupIdStatus === 'unavailable') return <XCircle className="h-5 w-5 text-destructive" />;
        return null;
    }

    return (
        <div className="grid gap-6">
            <BackButton href="../branches" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Create a New Branch</h1>
                <p className="text-muted-foreground">
                    Set up a new sub-brand or location for your main brand.
                </p>
            </div>
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Branch Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Branch Name</FormLabel><FormControl><Input placeholder="Uptown Branch" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            
                            <FormField control={form.control} name="neupIdSubdomain" render={({ field }) => ( 
                                <FormItem>
                                    <FormLabel>Branch NeupID</FormLabel>
                                    <div className="relative">
                                        <FormControl>
                                            <Input 
                                                placeholder="uptown-branch" 
                                                {...field}
                                                onChange={handleNeupIdChange}
                                                className="pr-10"
                                            />
                                        </FormControl>
                                        <div className="absolute inset-y-0 right-3 flex items-center">
                                            <NeupIdStatusIcon />
                                        </div>
                                    </div>
                                    {fullNeupIdPreview && (
                                        <FormDescription>
                                            Full NeupID will be: <span className="font-mono">{fullNeupIdPreview}</span>
                                        </FormDescription>
                                    )}
                                    <FormMessage />
                                </FormItem> 
                            )} />

                            <FormField control={form.control} name="location" render={({ field }) => ( <FormItem><FormLabel>Location (Optional)</FormLabel><FormControl><Input placeholder="123 Main St, Anytown" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isSubmitting || neupIdStatus !== 'available'}>
                                {isSubmitting ? "Creating Branch..." : "Create Branch"}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    )
}
