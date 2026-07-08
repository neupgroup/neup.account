import type { Metadata } from 'next';
import { FlowLink } from '@/components/ui/flow-link';
import { notFound } from 'next/navigation';
import { CreditCard, Globe, ArrowRight, AppWindow, Camera } from '@/components/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { checkPermissions } from '@/services/user';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { createPageMetadata } from '@/core/metadata';
import { permission } from '@/neup.logica/permission';

export const metadata: Metadata = createPageMetadata('Site Configuration');

const pagePermissions = [
  permission('root.payment_config.view', 'for_individual', 'page'),
  permission('root.display_images.view', 'for_individual', 'page'),
];

const configItems = [
  {
    href: '/site/config/socials',
    title: 'Social Accounts',
    description: 'Define social links shown in the website footer.',
    icon: Globe,
  },
  {
    href: '/site/config/payments',
    title: 'Payment Settings',
    description: 'Define payment details used across the website.',
    icon: CreditCard,
  },
  {
    href: '/site/config/app',
    title: 'App Settings',
    description: 'Update the site logo used across the application.',
    icon: AppWindow,
  },
  {
    href: '/site/config/displayImages',
    title: 'Display Images',
    description: 'Manage display-image resources and metadata.',
    icon: Camera,
  },
];

export default async function SiteConfigPage() {
  const [canViewPaymentConfig, canViewDisplayImages] = await Promise.all([
    checkPermissions(['root.payment_config.view']),
    checkPermissions(['root.display_images.view']),
  ]);

  if (!canViewPaymentConfig && !canViewDisplayImages) {
    notFound();
  }

  const visibleItems = configItems.filter((item) => {
    if (item.href === '/site/config/displayImages') return canViewDisplayImages;
    return canViewPaymentConfig;
  });

  return (
    <div className="grid gap-8">
      <BackButton href="/home" />

      <PrimaryHeader
        title="Configurations"
        description="Set website payment settings, footer social media accounts, and app branding."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {visibleItems.map((item) => (
          <FlowLink key={item.href} href={item.href}>
            <Card className="h-full cursor-pointer transition-all hover:border-primary/50 hover:bg-accent/40">
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </FlowLink>
        ))}
      </div>
    </div>
  );
}
