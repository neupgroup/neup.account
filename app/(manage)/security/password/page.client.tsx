
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/core/hooks/use-toast";
import { changePassword } from "@/services/security/password";
import { changePasswordSchema } from "@/services/security/schema";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState, useContext, useTransition } from "react";
import { BackButton } from "@/components/ui/back-button";
import { Geolocation } from "@/core/providers/geolocation";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { Loader2 } from "@/components/icons";

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordPage() {
    const { toast } = useToast();
    const [isSubmitting, startTransition] = useTransition();
    const geo = useContext(Geolocation);

    const form = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: {
            currentPassword: "",
            newPassword: "",
        },
    });

    async function onSubmit(data: ChangePasswordFormValues) {
        startTransition(async () => {
            const locationString = geo?.latitude && geo?.longitude ? `${'\'\'\''}${geo.latitude},${geo.longitude}` : undefined;
            const result = await changePassword(data, locationString);

            if (result.success) {
                toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
                form.reset();
            } else {
                 let description = result.error;
                if (result.details) {
                    description = Object.values(result.details.fieldErrors).flat().join(' | ');
                }
                toast({ variant: "destructive", title: "Error", description: description || "An error occurred." });
            }
        });
    }

    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Change Password</h1>
                <p className="text-muted-foreground">
                    Choose a strong, new password that you don't use for other accounts.
                </p>
            </div>
            <div className="space-y-2">
                <SecondaryHeader
                    title="Update Password"
                    description="Enter your current password and a new password to update your account."
                />
                <Card>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <CardContent className="space-y-4 pt-6">
                                <FormField
                                    control={form.control}
                                    name="currentPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Current Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} disabled={isSubmitting} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="newPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>New Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} disabled={isSubmitting} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : "Update Password"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>
            </div>
        </div>
    );
}

    