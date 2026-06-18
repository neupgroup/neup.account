'use client';

import { useSession } from '@/core/providers/session';
import { Card, CardContent } from '@/components/ui/card';
import { Users, List, Terminal, AppWindow } from '@/components/icons';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { ListItem } from '@/components/ui/list-item';

const managementItems = [
    {
        href: '/manage/accounts',
        label: 'Accounts',
        description: 'Browse and manage all accounts in the system.',
        icon: Users,
        permission: 'root.account.view',
    },
    {
        href: '/manage/requests',
        label: 'Requests',
        description: 'Review and act on pending user requests.',
        icon: List,
        permission: 'requests.root_approval.view',
    },
    {
        href: '/data/appconnection?mode=root',
        label: 'Applications',
        description: 'Approve, reject, block, or activate applications.',
        icon: AppWindow,
        permission: 'root.app.view',
    },
    {
        href: '/config',
        label: 'Configurations',
        description: 'Manage payment settings and footer social accounts.',
        icon: Terminal,
        permission: 'root.payment_config.view',
    },
];

export function SystemToolsCard() {
    const { permissions } = useSession();

    const visibleItems = managementItems.filter(
        (item) => !item.permission || permissions?.includes(item.permission)
    );

    if (visibleItems.length === 0) return null;

    return (
        <div className="space-y-2">
            <SecondaryHeader
                title="System Tools"
                description="Access administrative tools and system configurations."
            />
            <Card>
                <CardContent className="divide-y p-2">
                    {visibleItems.map((item) => (
                        <ListItem
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            title={item.label}
                            description={item.description}
                        />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
