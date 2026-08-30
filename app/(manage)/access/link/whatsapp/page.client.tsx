"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "#/core/hooks/useToast";
import { whatsAppFormSchema, verifyCodeSchema } from "./schema";
import { sendVerificationCode, linkWhatsAppAccount } from '@/services/manage/accounts/whatsapp';

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#/components/ui/form";
import { PhoneInput } from "#/components/ui/phone-input";
import { Loader2 } from "@/components/icons";
import { cn } from "#/core/utils";
import { BackButton } from "#/components/ui/back-button";
import { SecondaryHeader } from "#/components/ui/secondary-header";

export default function LinkWhatsAppPageClient({
    managerAccountId,
    backHref,
}: {
    managerAccountId?: string | null;
    backHref: string;
}) {
    const [step, setStep] = useState(1);
    const [isSubmitting, startTransition] = useTransition();
    const [whatsappNumber, setWhatsappNumber] = useState("");
    const { toast } = useToast();

    const form = useForm<z.infer<typeof whatsAppFormSchema>>({
        resolver: zodResolver(whatsAppFormSchema),
        defaultValues: { whatsappNumber: "" },
    });

    const verifyForm = useForm<z.infer<typeof verifyCodeSchema>>({
        resolver: zodResolver(verifyCodeSchema),
        defaultValues: { code: "", whatsappNumber: "" },
    });

    const handleSendCode = async (data: z.infer<typeof whatsAppFormSchema>) => {
        startTransition(async () => {
            const result = await sendVerificationCode(data, managerAccountId);
            if (result.success) {
                toast({ title: "Code Sent", description: "A verification code has been sent to your WhatsApp number." });
                setWhatsappNumber(data.whatsappNumber);
                verifyForm.setValue("whatsappNumber", data.whatsappNumber);
                setStep(2);
            } else {
                form.setError("whatsappNumber", { type: "manual", message: result.error });
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };
    
    const handleLinkAccount = async (data: z.infer<typeof verifyCodeSchema>) => {
        startTransition(async () => {
            const result = await linkWhatsAppAccount(data, managerAccountId);
            if (result.success) {
                 toast({ title: "Success!", description: "Your WhatsApp account has been linked.", className: "bg-accent text-accent-foreground" });
                 setStep(1);
                 form.reset();
                 verifyForm.reset();
            } else {
                verifyForm.setError("code", { type: "manual", message: result.error });
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };

    return (
        <div className="grid gap-8">
            <BackButton href={backHref} />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Link WhatsApp Account</h1>
                <p className="text-muted-foreground">
                    Connect your WhatsApp account for notifications and services.
                </p>
            </div>
            <div className="space-y-2">
                 <SecondaryHeader
                    title="Connect Your Number"
                    description="Enter your WhatsApp number to receive a verification code."
                 />
                <Card>
                     <CardContent className="pt-6">
                        {step === 1 && (
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleSendCode)} className="w-full space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="whatsappNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>WhatsApp Number</FormLabel>
                                                <div className="relative">
                                                    <FormControl>
                                                        <PhoneInput
                                                            {...field}
                                                            placeholder="e.g. +1234567890" 
                                                            className={cn("pr-28", form.formState.errors.whatsappNumber && "border-destructive focus-visible:ring-destructive")}
                                                            aria-invalid={!!form.formState.errors.whatsappNumber}
                                                            value={field.value ?? ""}
                                                        />
                                                    </FormControl>
                                                    <Button type="submit" className="absolute right-1 top-1/2 h-8 -translate-y-1/2 w-24" disabled={isSubmitting}>
                                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send Code</>}
                                                    </Button>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        )}
                        {step === 2 && (
                             <Form {...verifyForm}>
                                <form onSubmit={verifyForm.handleSubmit(handleLinkAccount)} className="w-full space-y-4">
                                     <div>
                                        <p className="text-sm text-muted-foreground">
                                           A verification code was sent to <span className="font-medium text-foreground">{whatsappNumber}</span>.
                                        </p>
                                     </div>
                                    <FormField
                                        control={verifyForm.control}
                                        name="code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Verification Code</FormLabel>
                                                <div className="relative">
                                                    <FormControl>
                                                         <Input 
                                                            {...field}
                                                            placeholder="Enter 6-digit code" 
                                                            className={cn("pr-32", verifyForm.formState.errors.code && "border-destructive focus-visible:ring-destructive")}
                                                            aria-invalid={!!verifyForm.formState.errors.code}
                                                            maxLength={6}
                                                        />
                                                    </FormControl>
                                                     <Button type="submit" className="absolute right-1 top-1/2 h-8 -translate-y-1/2 w-28" disabled={isSubmitting}>
                                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Link WhatsApp</>}
                                                    </Button>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button variant="link" size="sm" className="p-0 h-auto" type="button" onClick={() => setStep(1)}>
                                        Use a different number
                                    </Button>
                                </form>
                            </Form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
