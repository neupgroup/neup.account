
"use client";

import { useState, useTransition, useContext } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/core/hooks/use-toast";
import { scheduleMaterialization } from "@/services/data/materialization";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CalendarClock } from "@/components/icons";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackButton } from "@/components/ui/back-button";
import { Geolocation } from "@/core/providers/geolocation";
import { SecondaryHeader } from "@/components/ui/secondary-header";

const formSchema = z.object({
    inactivityDays: z.string().min(1, "Please select a time period."),
    password: z.string().optional(),
});

export default function MaterializationPage() {
  const [isPending, startTransition] = useTransition();
  const [isRequested, setIsRequested] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const { toast } = useToast();
  const geo = useContext(Geolocation);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (!showPasswordPrompt) {
        setShowPasswordPrompt(true);
        return;
    }

    if (!data.password) {
        form.setError("password", { type: "manual", message: "Password is required to confirm." });
        return;
    }

    startTransition(async () => {
      const locationString = geo?.latitude && geo?.longitude ? `${geo.latitude},${geo.longitude}` : undefined;
      const result = await scheduleMaterialization(data as {inactivityDays: string, password: string}, locationString);
      if (result.success) {
        toast({
          title: "Deletion Scheduled",
          description:
            "Your account deletion has been scheduled. An admin will review it after the inactivity period.",
        });
        setIsRequested(true);
        setShowPasswordPrompt(false);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    });
  };

  return (
    <div className="grid gap-8">
        <BackButton href="/manage/data" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule Deletion (Materialization)</h1>
        <p className="text-muted-foreground">
          Request your account to be deleted after a chosen period of inactivity.
        </p>
      </div>

        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
                <CardHeader>
                <SecondaryHeader
                    title="Schedule Account Materialization"
                    description="This action will send a request to an administrator for account deletion."
                />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert>
                        <AlertTitle>How It Works</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc space-y-2 pl-5 mt-2">
                                <li>
                                Choose a period of inactivity. If you do not log in for this duration, a deletion request is created.
                                </li>
                                <li>
                                The deletion request will be processed at the end of the calendar month in which your inactivity period ends.
                                </li>
                                <li>
                                An administrator will manually review the request before final data erasure.
                                </li>
                                <li>Logging in at any time resets the inactivity timer.</li>
                            </ul>
                        </AlertDescription>
                    </Alert>
                    <FormField
                        control={form.control}
                        name="inactivityDays"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Inactivity Period</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isRequested || isPending}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a period for account deletion..." />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    <SelectItem value="60">60 days</SelectItem>
                                    <SelectItem value="90">90 days</SelectItem>
                                    <SelectItem value="180">180 days</SelectItem>
                                    <SelectItem value="365">1 year</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {isRequested ? (
                        <Alert variant="default" className="border-primary text-primary [&>svg]:text-primary">
                            <AlertTitle>Request Scheduled</AlertTitle>
                            <AlertDescription>
                                Your request has been successfully submitted for admin review after the specified inactivity period.
                            </AlertDescription>
                        </Alert>
                    ) : showPasswordPrompt && (
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem className="pt-4">
                                    <FormLabel>Enter your password to confirm</FormLabel>
                                    <FormControl>
                                        <Input type="password" required autoFocus {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isPending || isRequested}>
                        {isPending ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<CalendarClock className="mr-2 h-4 w-4" />)}
                        {isRequested ? "Request Scheduled" : showPasswordPrompt ? "Confirm Schedule" : "Schedule Deletion"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
        </Form>
    </div>
  );
}
