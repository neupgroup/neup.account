"use client";

import { permission } from '@/.neup/logica/permission';
import { useMemo, type ElementType } from 'react';
import { Card, CardContent } from '#/components/ui/card';
import { ShieldCheck, Laptop, Link, AppWindow } from '@/components/icons';
import { ListItem } from '@/components/ui/ListItem';
import { TitleSet } from '#/components/element/titleset';
import { useSession } from '@/inapp/auth/session-context';
import { hasAnyPermission } from '@/inapp/permissions/profile-permissions';
import {
    SECURITY_PERMISSION_GROUPS,
} from '@/inapp/permissions/security-permissions';
import { LINKED_ACCOUNT_NAV_PERMISSIONS } from '@/inapp/permissions/linked-account-permissions';

const componentPermissions = [
    permission('security.pass.modify.self', 'for_individual', 'component'),
    permission('security.login_devices.view.self', 'for_individual', 'component'),
    permission('access.linked_account.view.self', 'for_individual', 'component'),
    permission('access.account.brand.create.self', 'for_individual', 'component'),
    permission('access.accounts.switch.self', 'for_individual', 'component'),
    permission('linked_accounts.brand.manage', 'for_brand', 'component'),
    permission('linked_accounts.brand.manager', 'for_brand', 'component'),
    permission('access.connection.view.self', 'for_individual', 'component'),
    permission('access.connection.add.self', 'for_individual', 'component'),
    permission('access.connection.remove.self', 'for_individual', 'component'),
    permission('access.application.view.self', 'for_individual', 'component'),
    permission('access.application.add.self', 'for_individual', 'component'),
    permission('access.application.remove.self', 'for_individual', 'component'),
];

type SettingsItem = {
    id: string;
    href: string;
    icon: ElementType;
    title: string;
    description: string;
    permissions: readonly string[];
    accountTypes: readonly string[];
};

const SETTINGS_ITEMS: SettingsItem[] = [
    {
        id: 'password-security',
        href: '/security/password',
        icon: ShieldCheck,
        title: 'Password and Security',
        description: 'Update your password and security settings.',
        permissions: SECURITY_PERMISSION_GROUPS.password,
        accountTypes: ['individual'],
    },
    {
        id: 'security-sessions',
        href: '/security/devices',
        icon: Laptop,
        title: 'Security and Session',
        description: 'Manage your active sessions and devices.',
        permissions: SECURITY_PERMISSION_GROUPS.devices,
        accountTypes: ['individual'],
    },
    {
        id: 'linked-accounts',
        href: '/access',
        icon: Link,
        title: 'Linked Accounts',
        description: 'Manage accounts linked to your profile.',
        permissions: LINKED_ACCOUNT_NAV_PERMISSIONS,
        accountTypes: ['individual'],
    },
    {
        id: 'access-control',
        href: '/access',
        icon: AppWindow,
        title: 'Access and Control',
        description: 'Control which apps can access your data.',
        permissions: SECURITY_PERMISSION_GROUPS.thirdParty,
        accountTypes: ['individual'],
    },
];

export function SettingsCard() {
    const { permissions, profile, loading } = useSession();

    const visibleItems = useMemo(() => {
        if (loading || !profile || profile.accountType !== 'individual' || !permissions) {
            return [];
        }

        return SETTINGS_ITEMS.filter((item) =>
            item.accountTypes.includes(profile.accountType ?? '') &&
            hasAnyPermission(permissions, item.permissions)
        );
    }, [loading, permissions, profile]);

    if (visibleItems.length === 0) {
        return null;
    }

    return (
         <div className="space-y-2">
            <TitleSet level={1}
                title="Account Settings"
                subtitle="Manage your account security and preferences."
            />
            <Card>
                <CardContent className="divide-y p-2">
                     {visibleItems.map((item) => (
                        <ListItem key={item.id} icon={item.icon} href={item.href} title={item.title} description={item.description} />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
