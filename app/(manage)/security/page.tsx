import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ListItem } from '@/components/ui/list-item';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { notFound } from 'next/navigation';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import { SECURITY_HUB_ITEMS, SECURITY_HUB_PERMISSIONS } from '@/core/auth/security-permissions';
import { getAccountPermission } from '@/services/user';
import { getActiveAccountId } from '@/core/auth/verify';

const SECTION_META = {
  signIn: {
    title: 'Sign-In Methods',
    description: 'Manage your passwords and two-factor authentication.',
  },
  recovery: {
    title: 'Recovery Methods',
    description: 'Set up ways to recover your account if you get locked out.',
  },
  checks: {
    title: 'Security Checks',
    description: 'Review security issues across apps, devices, and emails.',
  },
} as const;

export default async function SecurityPage() {
  const accountId = await getActiveAccountId();
  if (!accountId) {
    notFound();
  }

  await requireAnyPermission404(SECURITY_HUB_PERMISSIONS, accountId);

  const permissions = await getAccountPermission(accountId);
  const visibleItems = SECURITY_HUB_ITEMS.filter((item) => hasAnyPermission(permissions, item.permissions));

  const sections = (Object.keys(SECTION_META) as Array<keyof typeof SECTION_META>).map((section) => ({
    ...SECTION_META[section],
    items: visibleItems.filter((item) => item.section === section),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="grid gap-8">
      <PrimaryHeader
        title="Password & Security"
        description="Manage your account's security settings, review activity, and keep your account safe."
      />

      {sections.map((section) => (
        <div key={section.title} className="grid gap-4">
          <SecondaryHeader title={section.title} description={section.description} />
          <Card>
            <CardContent className="divide-y p-2">
              {section.items.map((item) => (
                <ListItem key={item.href} href={item.href} title={item.title} description={item.description} />
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
