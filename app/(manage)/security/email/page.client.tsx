
"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/core/hooks/use-toast";
import { getRecoveryEmail, addRecoveryEmail, removeRecoveryEmail } from "@/services/security/email";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Plus, Trash2 } from "@/components/icons";
import { cn } from "@/core/helpers/utils";
import { BackButton } from "@/components/ui/back-button";
import { emailFormSchema } from "@/services/security/schema";
import { SecondaryHeader } from "@/components/ui/secondary-header";

type EmailFormValues = z.infer<typeof emailFormSchema>;

export default function RecoveryEmailPage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [isSubmitting, startTransition] = useTransition();

    const form = useForm<EmailFormValues>({
        resolver: zodResolver(emailFormSchema),
        defaultValues: {
            email: "",
        },
    });

    const fetchEmail = async () => {
        setLoading(true);
        const email = await getRecoveryEmail();
        setEmail(email);
        form.reset({ email: "" }); // Reset form when fetching
        setLoading(false);
    };

    useEffect(() => {
        fetchEmail();
    }, []);

    const handleAdd = async (data: EmailFormValues) => {
        startTransition(async () => {
            const result = await addRecoveryEmail(data);
            if (result.success) {
                toast({ title: "Success", description: "Recovery email added.", className: "bg-accent text-accent-foreground" });
                form.reset();
                await fetchEmail();
            } else {
                form.setError("email", { type: "manual", message: result.error || "An unexpected error occurred." });
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };
    
    const handleRemove = async () => {
         startTransition(async () => {
            const result = await removeRecoveryEmail();
            if (result.success) {
                toast({ title: "Success", description: "Recovery email removed." });
                await fetchEmail();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }

    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Recovery Email</h1>
                <p className="text-muted-foreground">
                    This email can be used to help you get back into your account if you're locked out.
                </p>
            </div>
            <div className="space-y-2">
                <SecondaryHeader
                    title="Manage Email Address"
                    description="We will only use this email address for account recovery purposes."
                />
                <Card>
                    <CardContent className="pt-6">
                        {loading ? (
                            <Skeleton className="h-10 w-full" />
                        ) : email ? (
                            <div className="flex items-center justify-between rounded-md border border-input bg-background p-3">
                                <p className="font-mono text-sm">{email}</p>
                                <Button variant="ghost" size="icon" onClick={handleRemove} disabled={isSubmitting} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                     {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                            </div>
                        ) : (
                             <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleAdd)} className="w-full">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="sr-only">Email</FormLabel>

                                                <div className="relative">
                                                    <FormControl>
                                                        <Input 
                                                            {...field}
                                                            type="email" 
                                                            placeholder="Enter recovery email address" 
                                                            className={cn("pr-12", form.formState.errors.email && "border-destructive focus-visible:ring-destructive")}
                                                            aria-invalid={!!form.formState.errors.email}
                                                        />
                                                    </FormControl>
                                                    <Button type="submit" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent" disabled={isSubmitting}>
                                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                                        <span className="sr-only">Add Email</span>
                                                    </Button>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
