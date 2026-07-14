import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ListItem } from '@/components/ui/list-item';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { permission } from '@/logica/permission';
import { notFound } from 'next/navigation';
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { hasAnyPermission } from '@/core/account/profile-permissions';
import { SECURITY_HUB_ITEMS, SECURITY_HUB_PERMISSIONS } from '@/core/account/security-permissions';
import { getCurrentAccountPermission } from '@/services/user';
import { getActiveAccountId } from '@/services/account/verify';

const pagePermissions = [
    permission('security.pass.modify.self', 'for_individual', 'page'),
    permission('security.totp.add.self', 'for_individual', 'page'),
    permission('security.totp.remove.self', 'for_individual', 'page'),
    permission('security.backup_codes.view.self', 'for_individual', 'page'),
    permission('security.backup_codes.create.self', 'for_individual', 'page'),
    permission('security.recovery_accounts.view.self', 'for_individual', 'page'),
    permission('security.recovery_accounts.add.self', 'for_individual', 'page'),
    permission('security.recovery_accounts.remove.self', 'for_individual', 'page'),
    permission('security.recovery_phone.view.self', 'for_individual', 'page'),
    permission('security.recovery_phone.add.self', 'for_individual', 'page'),
    permission('security.recovery_phone.remove.self', 'for_individual', 'page'),
    permission('security.recovery_email.view.self', 'for_individual', 'page'),
    permission('security.recovery_email.add.self', 'for_individual', 'page'),
    permission('security.recovery_email.remove.self', 'for_individual', 'page'),
    permission('security.login_devices.view.self', 'for_individual', 'page'),
    permission('security.recent_activities.view.self', 'for_individual', 'page'),
    permission('access.connection.view.self', 'for_individual', 'page'),
    permission('access.connection.add.self', 'for_individual', 'page'),
    permission('access.connection.remove.self', 'for_individual', 'page'),
    permission('access.application.view.self', 'for_individual', 'page'),
    permission('access.application.add.self', 'for_individual', 'page'),
    permission('access.application.remove.self', 'for_individual', 'page'),
];

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

  await requireAnyPermission404(SECURITY_HUB_PERMISSIONS);

  const permissions = await getCurrentAccountPermission();
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
