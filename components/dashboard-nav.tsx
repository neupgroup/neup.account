'use client';

import { permission } from '@/logica/permission';
import { FlowLink } from '@/components/ui/flow-link'
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/core/utils"
import { buttonVariants } from "@/components/ui/button"
import { type NavSection, navItems, allPermissionsMap } from "./nav-data"
import { Skeleton } from "./ui/skeleton";
import { useSession } from "@/inapp/auth/session-context";
import { switchToPersonal } from "@/services/auth/switch";
import { hasAnyPermission, PROFILE_NAV_PERMISSIONS } from "@/inapp/permissions/profile-permissions";
import { DATA_PRIVACY_NAV_PERMISSIONS } from "@/inapp/permissions/data-permissions";
import { ACCESS_VIEW_PERMISSIONS } from "@/inapp/permissions/access-view-permissions";
import { APP_BASE_PATH } from '@/core/appconfig';

const componentPermissions = [
    permission('notification.read', 'for_individual', 'component'),
    permission('notification.delete', 'for_individual', 'component'),
    permission('application.view', 'for_individual', 'component'),
    permission('payment.method.show', 'for_individual', 'component'),
    permission('payment.transactions.show', 'for_individual', 'component'),
    permission('payment.subscriptions.show', 'for_individual', 'component'),
    permission('payment.purchase_neup_pro.view', 'for_individual', 'component'),
];

export function DashboardNav() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { permissions, isManaging, profile, loading, refetch } = useSession();
    const [isSwitching, startSwitchTransition] = useTransition();
    const [workingProfileNeupId, setWorkingProfileNeupId] = useState<string | null>(null);
    const [workingProfileName, setWorkingProfileName] = useState<string | null>(null);
    const workingProfile = searchParams.get('workingProfile')?.trim() || null;

    useEffect(() => {
        let isMounted = true;

        if (!workingProfile) {
            setWorkingProfileNeupId(null);
            setWorkingProfileName(null);
            return () => {
                isMounted = false;
            };
        }

        const fetchWorkingProfile = async () => {
            try {
                const sessionUrl = new URL(`${APP_BASE_PATH}/bridge/api.v1/auth/me`, window.location.origin);
                sessionUrl.searchParams.set('workingProfile', workingProfile);
                const response = await fetch(sessionUrl.toString(), {
                    cache: 'no-store',
                    credentials: 'include',
                });

                if (!response.ok) {
                    if (isMounted) {
                        setWorkingProfileNeupId(null);
                        setWorkingProfileName(null);
                    }
                    return;
                }

                const data = await response.json().catch(() => null);
                if (!isMounted) return;

                const profileInfo = data && typeof data === 'object' ? (data as { profileInfo?: { neupIdPrimary?: string; nameDisplay?: string } }).profileInfo : null;
                setWorkingProfileNeupId(profileInfo?.neupIdPrimary || null);
                setWorkingProfileName(profileInfo?.nameDisplay || null);
            } catch {
                if (isMounted) {
                    setWorkingProfileNeupId(null);
                    setWorkingProfileName(null);
                }
            }
        };

        void fetchWorkingProfile();
        return () => {
            isMounted = false;
        };
    }, [workingProfile]);

    const handleSwitchBack = () => {
        startSwitchTransition(async () => {
            await switchToPersonal();
            refetch();
            router.replace('/home');
            router.refresh();
        });
    };

    const navConfig: NavSection[] | null = useMemo(() => {
        if (loading || !permissions) return null;

        const navItemsWithPerms = (items: Omit<any, 'requiredPermissions' | 'iconName'>[]): any[] => {
            return items.map(item => ({
                ...item,
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

        const activeNeupId = workingProfileNeupId || profile?.neupIdPrimary || null;
        const primaryNeupId = activeNeupId ? `@${activeNeupId}` : 'NeupID';
        const title = isManaging ? (workingProfileName || profile?.nameDisplay) : primaryNeupId;

        const config: NavSection[] = [];

        if (isManaging) {
            const managedPrimaryItems = [
                { href: "/home", label: "Dashboard", description: "Your central account management hub.", requiredPermissions: [] as string[] },
                { href: "/profile", label: "Brand Info", description: "Manage profile details.", requiredPermissions: PROFILE_NAV_PERMISSIONS },
                { href: "/notifications", label: "Notifications", description: "View and manage account notifications.", requiredPermissions: ['notification.read', 'notification.delete'] },
                { href: "/data", label: "Data & Privacy", description: "View data access, activity, and privacy controls for this account.", requiredPermissions: DATA_PRIVACY_NAV_PERMISSIONS },
                { href: "/access", label: "Access & Control", description: "Manage access, people, and linked accounts for this brand.", requiredPermissions: [...ACCESS_VIEW_PERMISSIONS] },
                { href: "/application", label: "Applications", description: "Manage applications owned by this brand account.", requiredPermissions: ['application.view'] },
                { href: "/payment", label: "Payment & Subscription", description: "Manage billing and subscriptions for this account.", requiredPermissions: ['payment.method.show', 'payment.transactions.show', 'payment.subscriptions.show', 'payment.purchase_neup_pro.view'] },
            ].filter((item) => hasAnyPermission(permissions, item.requiredPermissions));

            if (managedPrimaryItems.length > 0) {
                config.push({ title: title || "Brand", items: managedPrimaryItems });
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

    }, [permissions, isManaging, profile, loading, workingProfileName, workingProfileNeupId]);

    // Find the single active item: the one with the longest href that matches the current path
    const activeHref = useMemo(() => {
        if (!navConfig) return null;
        const allItems = navConfig.flatMap(section => section.items);
        const matchingItems = allItems.filter(item => {
            if (item.href === '/home') {
                return pathname === '/home' || pathname === '/';
            }
            return pathname === item.href || pathname.startsWith(item.href + '/');
        });
        if (matchingItems.length === 0) return null;
        return matchingItems.reduce((longest, item) =>
            item.href.length > longest.href.length ? item : longest
        ).href;
    }, [navConfig, pathname]);

    if (loading || !navConfig) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <nav className="grid items-start gap-2 text-sm font-medium">
            {navConfig.map((section: NavSection) => (
                <div key={section.title} className="mt-4 first:mt-0">
                    {section.title && (
                        <div className="flex justify-between items-center px-3 py-2 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                            <span>{section.title}</span>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        {section.items.map((item) => {
                            if (item.href === '__switch_back__') {
                                return (
                                    <button
                                        key="switch-back"
                                        onClick={handleSwitchBack}
                                        disabled={isSwitching}
                                        className={cn(buttonVariants({ variant: "ghost", size: "default" }), "justify-start text-base md:text-sm w-full")}
                                    >
                                        {isSwitching ? 'Switching…' : item.label}
                                    </button>
                                );
                            }
                            const isActive = item.href === activeHref;
                            return (
                                <FlowLink
                                    key={item.href}
                                    href={item.href}
                                    data-active={isActive}
                                    className={cn(buttonVariants({ variant: "ghost", size: "default" }), "justify-start text-base md:text-sm")}
                                >
                                    {item.label}
                                </FlowLink>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}
