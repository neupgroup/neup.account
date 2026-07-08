'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/core/hooks/use-toast';
import { submitApplicationChangeRequest } from '@/services/applications/change-requests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Clock } from 'lucide-react';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or fewer.')
    .optional()
    .or(z.literal('')),
  icon: z.string().trim().max(50).optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .refine(
      (val) => !val || val === '' || (() => { try { new URL(val); return true; } catch { return false; } })(),
      { message: 'Website must be a valid URL.' },
    )
    .optional()
    .or(z.literal('')),
  status: z.enum(['development', 'active', 'hold', 'blocked']),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  appId: string;
  initialName: string;
  initialDescription?: string;
  initialIcon?: string;
  initialWebsite?: string;
  initialStatus: string;
  hasPendingRequest?: boolean;
};

export function AppEditForm({
  appId,
  initialName,
  initialDescription,
  initialIcon,
  initialWebsite,
  initialStatus,
  hasPendingRequest = false,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialName,
      description: initialDescription ?? '',
      icon: initialIcon ?? '',
      website: initialWebsite ?? '',
      status: (initialStatus as FormValues['status']) ?? 'development',
    },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await submitApplicationChangeRequest({ appId, ...values });
      if (result.success) {
        toast({
          title: 'Change request submitted',
          description: 'Your changes are pending review. They will be applied once approved.',
        });
      } else if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof FormValues, { message });
        }
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    });
  };

  return (
    <div className="grid gap-4">
      {hasPendingRequest && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>Pending review</AlertTitle>
          <AlertDescription>
            You have a change request awaiting approval. Submitting a new one is not possible until the current request is reviewed.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
            <CardDescription>Update the name, description, icon, website, and publication status.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Application name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Short description of the application" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon key</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. app-window" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="active">Published</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={isPending || hasPendingRequest}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasPendingRequest ? 'Request Pending' : 'Submit for Approval'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
    </div>
  );
}
