'use client';

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/core/hooks/use-toast";
import { sendWarning, blockServiceAccess, unblockServiceAccess } from "@/services/manage/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Ban, Loader2, MessageSquareWarning } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { TertiaryHeader } from "@/components/ui/tertiary-header";

export const warningReasons = {
    spam: "Spamming or Commercial Solicitation",
    harassment: "Harassment or Bullying",
    impersonation: "Impersonation",
    hate_speech: "Hate Speech",
    tos_violation: "Terms of Service Violation",
    other: "Other Policy Violation"
};

const sendWarningSchema = z.object({
    reasonKey: z.nativeEnum(warningReasons),
    source: z.string().optional(),
    remarks: z.string().min(1, { message: "Remarks are required to create an audit trail." }),
    noticeType: z.enum(['general', 'success', 'warning', 'error']),
    persistence: z.enum(['dismissable', 'untildays', 'permanent']),
    days: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.persistence === 'untildays' && (!data.days || isNaN(parseInt(data.days)) || parseInt(data.days) <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please enter a valid number of days.",
            path: ["days"],
        });
    }
});

type SendWarningFormValues = z.infer<typeof sendWarningSchema>;


export function SendWarningForm({ userId }: { userId: string }) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

     const form = useForm<SendWarningFormValues>({
        resolver: zodResolver(sendWarningSchema),
        defaultValues: {
            reasonKey: 'other',
            source: "",
            remarks: "",
            noticeType: 'general',
            persistence: 'dismissable',
            days: "7",
        }
    });

    const persistenceValue = form.watch('persistence');


    const handleSend = (values: SendWarningFormValues) => {
        startTransition(async () => {
            const dataToSend = {
                ...values,
                days: values.persistence === 'untildays' ? parseInt(values.days || '0') : undefined,
            };
            const result = await sendWarning(userId, dataToSend);
            if (result.success) {
                toast({ title: "Success", description: "Warning has been sent to the user.", className: "bg-accent text-accent-foreground" });
                form.reset();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };

    return (
        <div className="grid gap-4">
            <TertiaryHeader
                title="Send Warning"
                description="Send a notification to the user that will appear on their dashboard."
            />
             <Card>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSend)}>
                        <CardContent className="space-y-4 pt-6">
                            <FormField
                                control={form.control}
                                name="reasonKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reason for Warning</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {Object.entries(warningReasons).map(([key, value]) => (
                                                    <SelectItem key={key} value={key}>{value}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField control={form.control} name="source" render={({ field }) => (
                                <FormItem><FormLabel>Source (Optional)</FormLabel><FormControl><Input placeholder="e.g., Report ID, User ID, URL" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="remarks" render={({ field }) => (
                                <FormItem><FormLabel>Internal Remarks</FormLabel><FormControl><Textarea placeholder="e.g., User has been warned twice for spamming." {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <FormField control={form.control} name="noticeType" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Notice Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="general">General (Blue)</SelectItem>
                                                <SelectItem value="success">Success (Green)</SelectItem>
                                                <SelectItem value="warning">Warning (Orange)</SelectItem>
                                                <SelectItem value="error">Error (Red)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                 <FormField control={form.control} name="persistence" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Persistence</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select persistence" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="dismissable">Dismissable</SelectItem>
                                                <SelectItem value="untildays">Until Days</SelectItem>
                                                <SelectItem value="permanent">Permanent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                {persistenceValue === 'untildays' && (
                                     <FormField control={form.control} name="days" render={({ field }) => (
                                        <FormItem><FormLabel>Days to Persist</FormLabel><FormControl><Input type="number" placeholder="7" {...field} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Send Warning
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}

export const blockReasons = {
    security_risk: { reason: "Compromised Account / Security Risk", message: "Your account has been temporarily blocked due to a potential security risk." },
    payment_issue: {
        reason: "Payment or Billing Issue",
        message: "Your account access has been blocked due to a payment or billing issue. Please contact support."
    },
    tos_repeated: {
        reason: "Repeated Terms of Service Violations",
        message: "Your account has been blocked due to repeated violations of our Terms of Service."
    },
    illegal_activity: {
        reason: "Illegal Activity",
        message: "Your account has been permanently blocked due to illegal activity."
    },
    other: {
        reason: "Other Policy Violation",
        message: "Your account has been blocked for violating our policies. Please contact support for more information."
    }
} as const;

const blockServiceSchema = z.object({
    reasonKey: z.enum(['security_risk', 'payment_issue', 'tos_repeated', 'illegal_activity', 'other'] as const),
    isPermanent: z.boolean().default(false),
    duration: z.string().optional(),
    source: z.string().optional(),
    remarks: z.string().min(1, { message: "Remarks are required for audit trail." }),
}).superRefine((data, ctx) => {
    if (!data.isPermanent && (!data.duration || isNaN(parseInt(data.duration)) || parseInt(data.duration) <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid duration in hours is required.", path: ["duration"] });
    }
});
type BlockServiceFormValues = z.infer<typeof blockServiceSchema>;

export function BlockServiceAccessForm({ userId, currentBlock }: { userId: string, currentBlock: any | null }) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const router = useRouter();
    const [formattedDate, setFormattedDate] = useState<string | null>(null);

    const form = useForm<BlockServiceFormValues>({
        resolver: zodResolver(blockServiceSchema),
        defaultValues: { isPermanent: false, duration: '24', reasonKey: 'other', source: '', remarks: '' }
    });
    const isPermanent = form.watch("isPermanent");
    
    useEffect(() => {
        if (currentBlock?.until) {
            setFormattedDate(new Date(currentBlock.until).toLocaleString());
        }
    }, [currentBlock]);

    const handleBlock = (values: BlockServiceFormValues) => {
        startTransition(async () => {
            const result = await blockServiceAccess(userId, {
                isPermanent: values.isPermanent,
                durationInHours: values.isPermanent ? undefined : parseInt(values.duration || '0'),
                reasonKey: values.reasonKey,
                source: values.source,
                remarks: values.remarks,
            });
            if (result.success) {
                toast({ title: "Success", description: "User's service access has been blocked.", className: "bg-accent text-accent-foreground" });
                router.refresh();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };
    
    const handleUnblock = () => {
        startTransition(async () => {
            const result = await unblockServiceAccess(userId);
            if (result.success) {
                toast({ title: "Success", description: "User's service access has been restored." });
                router.refresh();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }

    if (currentBlock?.status) {
         return (
             <div className="grid gap-4">
                 <TertiaryHeader
                    title="Service Access Blocked"
                    description="This user's access to services is currently blocked."
                />
                <Card>
                    <CardContent className="pt-6 space-y-2 text-sm">
                        <p><strong>Reason:</strong> {currentBlock.reason}</p>
                        <p><strong>Message Shown to User:</strong> {currentBlock.message}</p>
                        <p>
                            <strong>Block Type:</strong> {currentBlock.is_permanent ? 'Permanent' : `Temporary (until ${formattedDate || '...'})`}
                        </p>
                        <p><strong>Source:</strong> {currentBlock.source || 'N/A'}</p>
                        <p><strong>Remarks:</strong> {currentBlock.remarks || 'N/A'}</p>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleUnblock} disabled={isPending} variant="outline">
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Unblock Now
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
         <div className="grid gap-4">
            <TertiaryHeader
                title="Block Service Access"
                description="Temporarily or permanently block the user from accessing any service after logging in."
            />
            <Card>
                <Form {...form}>
                <form onSubmit={form.handleSubmit(handleBlock)}>
                    <CardContent className="pt-6 space-y-4">
                        <FormField
                            control={form.control}
                            name="reasonKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reason for Block</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value)} value={String(field.value)}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            {Object.entries(blockReasons).map(([key, value]) => (
                                                <SelectItem key={key} value={key}>{value.reason}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField control={form.control} name="source" render={({ field }) => ( <FormItem><FormLabel>Source (Optional)</FormLabel><FormControl><Input placeholder="e.g., Report ID, User ID, URL" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={form.control} name="remarks" render={({ field }) => ( <FormItem><FormLabel>Internal Remarks</FormLabel><FormControl><Textarea placeholder="Provide details for the audit log..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        
                        <div className="flex items-center space-x-2">
                            <FormField control={form.control} name="isPermanent" render={({ field }) => (
                                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} id="is-permanent" /></FormControl>
                                    <FormLabel htmlFor="is-permanent">Permanent Block</FormLabel>
                                </FormItem>
                            )}/>
                        </div>
                        {!isPermanent && (
                             <FormField control={form.control} name="duration" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Duration (in hours)</FormLabel>
                                    <FormControl><Input type="number" placeholder="24" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" variant="destructive" disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Block User
                        </Button>
                    </CardFooter>
                </form>
                </Form>
            </Card>
        </div>
    );
}