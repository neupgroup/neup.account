import { permission } from "@/logica/permission";
import { PROFILE_NAV_PERMISSIONS } from "@/core/auth/profile-permissions";
import { SECURITY_HUB_PERMISSIONS } from "@/core/auth/security-permissions";
import { DATA_PRIVACY_NAV_PERMISSIONS } from "@/core/auth/data-permissions";
import {
    ACCESS_BLOCK_VIEW_PERMISSIONS,
    ACCESS_VIEW_PERMISSIONS,
} from "@/core/auth/access-view-permissions";

const navPermissions = [
    permission("notification.read", "for_individual", "component"),
    permission("notification.delete", "for_individual", "component"),
    permission("payment.method.show", "for_individual", "component"),
    permission("payment.transactions.show", "for_individual", "component"),
    permission("payment.subscriptions.show", "for_individual", "component"),
    permission("payment.purchase_neup_pro.view", "for_individual", "component"),
    permission("root.account.view", "for_individual", "component"),
    permission("root.account.search", "for_individual", "component"),
    permission("root.account.create_individual", "for_individual", "component"),
    permission("requests.root_approval.view", "for_individual", "component"),
    permission("root.payment_config.view", "for_individual", "component"),
    permission("root.display_images.view", "for_individual", "component"),
    permission("root.display_images.add", "for_individual", "component"),
    permission("root.display_images.update", "for_individual", "component"),
    permission("root.display_images.delete", "for_individual", "component"),
    permission("root.permission.view", "for_individual", "component"),
    permission("root.permission.edit", "for_individual", "component"),
    permission("application.view", "for_individual", "component"),
    permission("linked_accounts.brand.manage", "for_brand", "component"),
    permission("root.dashboard.view", "for_individual", "component"),
    permission("root.account.delete", "for_individual", "component"),
];

export type NavItem = {
    href: string;
    label: string;
    description: string;
    icon?: React.ElementType;
}

export type NavSection = {
    title: string | null;
    items: NavItem[];
}

export const navItems = {
    neupIdNav: [
        { 
            href: "/home", 
            label: "Home", 
            description: "Your central account management hub.",
        },
        { 
            href: "/profile", 
            label: "Personal Info", 
            description: "Manage your personal details and contact information.",
        },
        { 
            href: "/notifications", 
            label: "Notifications", 
            description: "View and manage all your account notifications.",
        },
        { 
            href: "/security", 
            label: "Password & Security", 
            description: "Update your password and manage your account's security.",
        },
        { 
            href: "/data", 
            label: "Data & Privacy", 
            description: "See your data and the way we use it.",
        },
        { 
            href: "/application", 
            label: "Applications", 
            description: "Manage and administer your applications.",
        },
        { 
            href: "/access", 
            label: "Access & Control", 
            description: "Manage who you share data and services with.",
        },
        { 
            href: "/payment", 
            label: "Payment & Subscription", 
            description: "Manage billing and subscriptions.",
        },
    ],
    managementNav: [
        { href: "/manage", label: "Dashboard", description: "Admin dashboard — accounts, apps, and system overview." },
        { href: "/manage/requests", label: "Requests", description: "Review and act on pending user requests." },
        { href: "/data/appconnection?mode=root", label: "Applications", description: "Approve, reject, block, or activate applications." },
        { href: "/cleanup", label: "Cleanup", description: "Delete expired guest accounts and their associated data." },
        { href: "/site/config", label: "Configurations", description: "Manage payment settings and footer social accounts." },
    ],
    rootNav: [
        { href: "/manage", label: "Manage", description: "Open the root management dashboard." },
        { href: "/manage/requests", label: "Requests", description: "Review and act on pending user and application requests." },
        { href: "/manage/cleanup", label: "Cleanup Accounts", description: "Delete expired guest accounts and their associated data." },
        { href: "/site/config", label: "Site Config", description: "Open site-wide configuration tools." },
    ],
    accountNav: [
        { href: "/auth/signout", label: "SignOut Account", description: "Sign out of your account." },
    ],
};


export const allPermissionsMap: Record<string, string[]> = {
    "Home": [],
    "Personal Info": [...PROFILE_NAV_PERMISSIONS],
    "Profile": [...PROFILE_NAV_PERMISSIONS],
    "Notifications": ['notification.read', 'notification.delete'],
    "Password & Security": [...SECURITY_HUB_PERMISSIONS],
    "Data & Privacy": [...DATA_PRIVACY_NAV_PERMISSIONS],
    "Access & Control": [...ACCESS_VIEW_PERMISSIONS],
    "Payment & Subscription": ['payment.method.show', 'payment.transactions.show', 'payment.subscriptions.show', 'payment.purchase_neup_pro.view'],
    "Account": ["root.account.view", "root.account.search", "root.account.create_individual"],
    "Requests": ["requests.root_approval.view"],
    "Configurations": [
        "root.payment_config.view",
        "root.display_images.view",
        "root.display_images.add",
        "root.display_images.update",
        "root.display_images.delete"
    ],
    "Permissions": ["root.permission.view", "root.permission.edit"],
    "Applications": ["application.view"],
    "Site Config": [
        "root.payment_config.view",
        "root.display_images.view"
    ],
    "Subbrands": ['linked_accounts.brand.manage'],
    "Blocked Users": [...ACCESS_BLOCK_VIEW_PERMISSIONS],
    // Management nav — "Dashboard" is the admin home, distinct from user "Home"
    "Dashboard": ["root.dashboard.view"],
    "Manage": ["root.dashboard.view"],
    "Cleanup": ["root.account.delete"],
    "Cleanup Accounts": ["root.account.delete"],
};
