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
            href: "/accounts", 
            label: "Linked Accounts", 
            description: "Manage brand, branch, and dependent accounts.",
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
            href: "/people", 
            label: "People & Sharing", 
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
        { href: "/config", label: "Configurations", description: "Manage payment settings and footer social accounts." },
    ],
    accountNav: [
        { href: "/auth/start", label: "Switch Account", description: "Switch between different NeupID accounts." },
        { href: "/auth/signout", label: "SignOut Account", description: "Sign out of your account." },
    ],
};


export const allPermissionsMap: Record<string, string[]> = {
    "Home": [],
    "Personal Info": ['profile.view', 'profile.modify', 'contact.view', 'contact.add', 'contact.modify', 'contact.remove'],
    "Notifications": ['notification.read', 'notification.delete'],
    "Password & Security": [
        'security.pass.modify', 'security.totp.add', 'security.totp.remove', 'security.backup_codes.view', 
        'security.backup_codes.create', 'security.recovery_accounts.view', 'security.recovery_accounts.add', 
        'security.recovery_accounts.remove', 'security.recovery_phone.view', 'security.recovery_phone.add', 
        'security.recovery_phone.remove', 'security.recovery_email.view', 'security.recovery_email.add', 
        'security.recovery_email.remove', 'security.login_devices.view'
    ],
    "Linked Accounts": ['linked_accounts.brand.create', 'linked_accounts.brand.view', 'linked_accounts.dependent.create', 'linked_accounts.dependent.view'],
    "Data & Privacy": [
        'data.agreed_terms.view', 'data.delete_account.start', 'data.deactivate_account.start', 
        'data.materialization.view', 'data.materialization.modify', 'security.third_party.view', 'security.recent_activities.view'
    ],
    "Access & Control": ['security.third_party.view', 'security.third_party.add', 'security.third_party.remove'],
    "People & Sharing": ['people.family.view', 'people.family.add', 'people.family.remove', 'people.family.partner.add', 'people.family.partner.remove', 'people.block_list.view', 'people.restrict_list.view'],
    "Payment & Subscription": ['payment.method.show', 'payment.transactions.show', 'payment.subscriptions.show', 'payment.purchase_neup_pro.view'],
    "Account": ["root.account.view", "root.account.search", "root.account.create_individual"],
    "Requests": ["root.requests.view"],
    "Configurations": [
        "root.payment_config.view",
        "root.errors.view",
        "root.display_images.view",
        "root.display_images.add",
        "root.display_images.update",
        "root.display_images.delete"
    ],
    "Permissions": ["root.permission.view", "root.permission.edit"],
    "Applications": ["root.app.view", "root.app.create"],
    "Site Config": [
        "root.payment_config.view",
        "root.errors.view",
        "root.display_images.view"
    ],
    "Branches": ['linked_accounts.brand.manage'],
    "Blocked Users": ['people.block_list.view', 'people.restrict_list.view'],
    // Management nav — "Dashboard" is the admin home, distinct from user "Home"
    "Dashboard": ["root.dashboard.view"],
    "Cleanup": ["root.account.delete"],
};
