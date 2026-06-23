"use client";

import { useMemo, type ElementType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, Laptop, Link, AppWindow } from '@/components/icons';
import { ListItem } from '../ui/list-item';
import { SecondaryHeader } from '../ui/secondary-header';
import { useSession } from '@/core/providers/session';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import {
    SECURITY_PERMISSION_GROUPS,
} from '@/core/auth/security-permissions';
import { LINKED_ACCOUNT_NAV_PERMISSIONS } from '@/core/auth/linked-account-permissions';

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
            <SecondaryHeader
                title="Account Settings"
                description="Manage your account security and preferences."
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
