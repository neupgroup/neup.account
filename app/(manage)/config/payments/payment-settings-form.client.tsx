'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/core/hooks/use-toast';
import { updatePaymentSettings, type PaymentSettings } from '@/services/manage/site/payments';

type PaymentSettingsFormProps = {
  initialSettings: PaymentSettings;
};

export function PaymentSettingsForm({ initialSettings }: PaymentSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<PaymentSettings>(initialSettings);
  const { toast } = useToast();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updatePaymentSettings(formData);

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: result.error || 'Unable to save payment settings.',
        });
        return;
      }

      if (result.data) {
        setSettings(result.data);
      }

      toast({
        title: 'Payment settings updated',
        description: 'Website payment configuration was saved successfully.',
      });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website Payment Configuration</CardTitle>
        <CardDescription>
          Configure payment destination details and instructions for users.
        </CardDescription>
      </CardHeader>
      <form action={handleSubmit}>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="providerName">Provider Name</Label>
            <Input
              id="providerName"
              name="providerName"
              placeholder="Razorpay / Stripe / Bank Transfer"
              defaultValue={settings.providerName || ''}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accountName">Account Holder Name</Label>
            <Input
              id="accountName"
              name="accountName"
              placeholder="Neup Group"
              defaultValue={settings.accountName || ''}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              placeholder="1234567890"
              defaultValue={settings.accountNumber || ''}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ifscCode">IFSC / Routing Code</Label>
            <Input
              id="ifscCode"
              name="ifscCode"
              placeholder="SBIN0000000"
              defaultValue={settings.ifscCode || ''}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="upiId">UPI ID</Label>
            <Input
              id="upiId"
              name="upiId"
              placeholder="neupgroup@upi"
              defaultValue={settings.upiId || ''}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qrCodeUrl">QR Code Image URL</Label>
            <Input
              id="qrCodeUrl"
              name="qrCodeUrl"
              placeholder="https://..."
              defaultValue={settings.qrCodeUrl || ''}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="notes">Payment Instructions</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Add checkout instructions or payment notes shown to users."
              defaultValue={settings.notes || ''}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Payment Settings
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
