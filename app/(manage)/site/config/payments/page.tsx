import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { checkPermissions } from '@/services/user';
import { getPaymentSettings } from '@/services/manage/site/payments';
import { PaymentSettingsForm } from '../../../config/payments/payment-settings-form.client';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
  permission('root.payment_config.view', 'for_individual', 'page'),
];

export default async function SiteConfigPaymentsPage() {
  const canView = await checkPermissions(['root.payment_config.view']);
  if (!canView) {
    notFound();
  }

  const initialSettings = await getPaymentSettings();

  return (
    <div className="grid gap-8">
      <BackButton href="/site/config" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payment Settings</h1>
        <p className="text-muted-foreground">
          Define payment details used by the website checkout and billing flows.
        </p>
      </div>
      <PaymentSettingsForm initialSettings={initialSettings} />
    </div>
  );
}
