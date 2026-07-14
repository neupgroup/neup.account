'use client';

import { permission } from "@/logica/permission";
import React, { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    UserCircle,
    Key,
    type LucideIcon,
    Home,
    FolderGit2,
    Database,
    Combine,
    HeartHandshake,
    Gem,
    Users,
    LogOut,
    ArrowLeft,
    AppWindow,
    AlertTriangle,
    Wallet,
    ShieldCheck,
    Clock,
} from "@/components/icons";
import { type NavSection, navItems, allPermissionsMap } from "./nav-data";
import { NotificationBell } from "./warning-display";
import { ListItem } from "./ui/list-item";
import { useSession } from "@/inapp/auth/session-context";
import { Skeleton } from "./ui/skeleton";
import { switchToPersonal } from "@/services/auth/switch";
import { hasAnyPermission, PROFILE_NAV_PERMISSIONS } from "@/core/account/profile-permissions";
import { redirectInApp } from "@/core/helpers/navigation";
import { DATA_PRIVACY_NAV_PERMISSIONS } from "@/core/account/data-permissions";
import { ACCESS_VIEW_PERMISSIONS } from "@/core/account/access-view-permissions";

const componentPermissions = [
    permission("notification.read", "for_individual", "component"),
    permission("notification.delete", "for_individual", "component"),
    permission("application.view", "for_individual", "component"),
    permission("payment.method.show", "for_individual", "component"),
    permission("payment.transactions.show", "for_individual", "component"),
    permission("payment.subscriptions.show", "for_individual", "component"),
    permission("payment.purchase_neup_pro.view", "for_individual", "component"),
];

const iconMap: { [key: string]: LucideIcon | React.ElementType } = {
    Home: Home,
    PersonalInfo: UserCircle,
    Notifications: NotificationBell,
    PasswordAndSecurity: Key,
    LinkedAccounts: Combine,
    DataAndPrivacy: Database,
    AccessAndControl: FolderGit2,
    PeopleAndSharing: HeartHandshake,
    PaymentAndSubscription: Gem,
    SwitchAccount: Users,
    SignOutAccount: LogOut,
    SwitchBack: ArrowLeft,
    Dashboard: Home,
    "Account Management": Users,
    "Requests Management": Clock,
    "PermissionManagement": ShieldCheck,
    "AppManagement": AppWindow,
    "SystemErrors": AlertTriangle,
    "PaymentDetails": Wallet,
    "BrandInfo": UserCircle,
    Profile: UserCircle,
};

export function MobileNav() {
    const { permissions, isManaging, profile, loading, refetch } = useSession();
    const router = useRouter();
    const [isSwitching, startSwitchTransition] = useTransition();

    const handleSwitchBack = () => {
        startSwitchTransition(async () => {
            await switchToPersonal();
            refetch();
            redirectInApp(router, '/home');
            router.refresh();
        });
    };

    const navConfig: NavSection[] | null = useMemo(() => {
        if (loading || !permissions) return null;

        const navItemsWithPerms = (items: Omit<any, 'requiredPermissions' | 'icon'>[]): any[] => {
            return items.map(item => ({
                ...item,
                icon: iconMap[item.label.replace(/\s/g, '')] || UserCircle,
                requiredPermissions: allPermissionsMap[item.label] || []
            })).filter(item => hasAnyPermission(permissions, item.requiredPermissions));
        };
        
        const accountNavItems = isManaging
            ? navItems.accountNav
                .concat([{ href: '__switch_back__', label: 'Switch Back', description: 'Return to your personal account.' }])
            : navItems.accountNav;

        const visibleNeupIdNav = navItemsWithPerms(navItems.neupIdNav);
        const visibleRootNav = navItemsWithPerms(navItems.rootNav);
        const visibleAccountNav = navItemsWithPerms(accountNavItems);
        
        const primaryNeupId = profile?.neupIdPrimary ? `@${profile.neupIdPrimary}` : 'NeupID';

        const config: NavSection[] = [];
        
        if (isManaging) {
            const managedPrimaryItems = [
                { href: "/home", label: "Dashboard", description: "Your central account management hub.", icon: Home, requiredPermissions: [] as string[] },
                { href: "/profile", label: "Brand Info", description: "Manage profile details.", icon: iconMap['BrandInfo'], requiredPermissions: PROFILE_NAV_PERMISSIONS },
                { href: "/notifications", label: "Notifications", description: "View and manage account notifications.", icon: iconMap['Notifications'], requiredPermissions: ['notification.read', 'notification.delete'] },
                { href: "/data", label: "Data & Privacy", description: "View data access, activity, and privacy controls for this account.", icon: iconMap['DataAndPrivacy'], requiredPermissions: DATA_PRIVACY_NAV_PERMISSIONS },
                { href: "/access", label: "Access & Control", description: "Manage access, people, and linked accounts for this brand.", icon: iconMap['AccessAndControl'], requiredPermissions: [...ACCESS_VIEW_PERMISSIONS] },
                { href: "/application", label: "Applications", description: "Manage applications owned by this brand account.", icon: AppWindow, requiredPermissions: ['application.view'] },
                { href: "/payment", label: "Payment & Subscription", description: "Manage billing and subscriptions for this account.", icon: iconMap['PaymentAndSubscription'], requiredPermissions: ['payment.method.show', 'payment.transactions.show', 'payment.subscriptions.show', 'payment.purchase_neup_pro.view'] },
            ].filter((item) => hasAnyPermission(permissions, item.requiredPermissions));

            if (managedPrimaryItems.length > 0) {
                config.push({ title: profile?.nameDisplay || "Brand", items: managedPrimaryItems });
            }
             config.push({ title: "Account", items: visibleAccountNav });
        } else {
            if (visibleNeupIdNav.length > 0) {
                config.push({ title: primaryNeupId, items: visibleNeupIdNav });
            }
            if (visibleRootNav.length > 0) {
                config.push({ title: "Root", items: visibleRootNav });
            }
            if (visibleAccountNav.length > 0) {
                config.push({ title: "Account", items: visibleAccountNav });
            }
        }

        return config;
    }, [permissions, isManaging, profile, loading]);

    if (loading || !navConfig) {
        return (
            <div className="grid gap-8">
                 <div>
                    <h1 className="text-3xl font-bold tracking-tight">NeupID</h1>
                    <p className="text-muted-foreground">
                        Navigate to different sections of your account.
                    </p>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-6 w-1/3" />
                    <Card><CardContent className="p-0 divide-y"><ListItemSkeleton /><ListItemSkeleton /><ListItemSkeleton /></CardContent></Card>
                </div>
            </div>
        )
    }

    return (
        <div className="grid gap-8">
             <div>
                <h1 className="text-3xl font-bold tracking-tight">NeupID</h1>
                <p className="text-muted-foreground">
                    Navigate to different sections of your account.
                </p>
            </div>
            {navConfig.map((section: NavSection) => (
                 <div key={section.title || 'main'} className="space-y-2">
                    {section.title && <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>}
                    <Card>
                        <CardContent className="divide-y p-0">
                           {section.items.map((item, index) => {
                               if (item.href === '__switch_back__') {
                                   return (
                                       <button
                                           key="switch-back"
                                           onClick={handleSwitchBack}
                                           disabled={isSwitching}
                                           className="flex items-center gap-4 py-4 px-4 w-full text-left hover:bg-muted/50 transition-colors"
                                       >
                                           <ArrowLeft className="h-5 w-5 text-muted-foreground shrink-0" />
                                           <div className="flex-grow">
                                               <p className="text-sm font-medium">{isSwitching ? 'Switching…' : item.label}</p>
                                               <p className="text-xs text-muted-foreground">{item.description}</p>
                                           </div>
                                       </button>
                                   );
                               }
                               return (
                                   <ListItem key={index} href={item.href} title={item.label} description={item.description} icon={(item as any).icon} />
                               );
                           })}
                        </CardContent>
                    </Card>
                </div>
            ))}
        </div>
    )
}

const ListItemSkeleton = () => (
    <div className="flex items-center gap-4 py-4 px-4">
        <Skeleton className="h-6 w-6 rounded-full" />
        <div className="flex-grow space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-5 w-5" />
    </div>
)
