"use client";

import { useMemo, type ElementType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, Laptop, Link, AppWindow, Users } from '@/components/icons';
import { ListItem } from '../ui/list-item';
import { SecondaryHeader } from '../ui/secondary-header';
import { useSession } from '@/core/providers/session';
import { hasAnyPermission } from '@/core/auth/profile-permissions';
import {
    SECURITY_PERMISSION_GROUPS,
} from '@/core/auth/security-permissions';
import { LINKED_ACCOUNT_NAV_PERMISSIONS } from '@/core/auth/linked-account-permissions';

type SettingsItem = {
    href: string;
    icon: ElementType;
    title: string;
    description: string;
    permissions: readonly string[];
    accountTypes: readonly string[];
};

const SETTINGS_ITEMS: SettingsItem[] = [
    {
        href: '/security/password',
        icon: ShieldCheck,
        title: 'Password and Security',
        description: 'Update your password and security settings.',
        permissions: SECURITY_PERMISSION_GROUPS.password,
        accountTypes: ['individual'],
    },
    {
        href: '/security/devices',
        icon: Laptop,
        title: 'Security and Session',
        description: 'Manage your active sessions and devices.',
        permissions: SECURITY_PERMISSION_GROUPS.devices,
        accountTypes: ['individual'],
    },
    {
        href: '/accounts/link',
        icon: Link,
        title: 'Linked Accounts',
        description: 'Manage accounts linked to your profile.',
        permissions: LINKED_ACCOUNT_NAV_PERMISSIONS,
        accountTypes: ['individual'],
    },
    {
        href: '/access',
        icon: AppWindow,
        title: 'Access and Control',
        description: 'Control which apps can access your data.',
        permissions: SECURITY_PERMISSION_GROUPS.thirdParty,
        accountTypes: ['individual'],
    },
    {
        href: '/people',
        icon: Users,
        title: 'People and Sharing',
        description: 'Manage family members and sharing options.',
        permissions: [
            'people.family.view',
            'people.family.add',
            'people.family.remove',
            'people.family.partner.add',
            'people.family.partner.remove',
            'people.block_list.view',
            'people.restrict_list.view',
        ],
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
                        <ListItem key={item.href} icon={item.icon} href={item.href} title={item.title} description={item.description} />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
