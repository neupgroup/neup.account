import React from "react";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ListItem } from "@/components/ui/list-item";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { UserCircle, FileText, HeartHandshake, AtSign, Contact, ShieldCheck } from "@/components/icons";
import { getActiveAccountId, getPersonalAccountId } from "@/core/auth/verify";
import { getSessionCookies } from "@/core/helpers/cookies";
import { checkGrantedPermissions, checkPermissions, getUserProfile } from "@/services/user";
import { logSystemError } from "@/core/helpers/logger";

function isDebuggingEnabled() {
    return (
        process.env.NODE_ENV !== 'production' ||
        process.env.DEBUGGING_MODE === 'true' ||
        process.env.debugging_mode === 'true'
    );
}

function AccessDenied() {
    return (
        <div className="grid gap-8">
            <PrimaryHeader
                title="Access denied"
                description="You do not have access to this page."
            />
            <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                    You do not have access to this page.
                </CardContent>
            </Card>
        </div>
    );
}

export default async function ProfilePage() {
    const accountId = await getActiveAccountId();
    if (!accountId) {
        notFound();
    }

    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        notFound();
    }

    const { managingAccountId } = await getSessionCookies();

    const accountProfile = await getUserProfile(accountId);
    if (!accountProfile) {
        notFound();
    }

    const requiredPermission = 'profile.view';
    const canViewProfile = managingAccountId
        ? await checkGrantedPermissions([requiredPermission], personalAccountId, accountId)
        : await checkPermissions([requiredPermission]);

    if (!canViewProfile) {
        if (isDebuggingEnabled()) {
            const denialMessage = `Missing permission "${requiredPermission}" for account "${personalAccountId}" while viewing selected account "${accountId}".`;
            // eslint-disable-next-line no-console
            console.error(denialMessage);
            await logSystemError(denialMessage, 'profile.page.permission_denied');
            return <AccessDenied />;
        }

        notFound();
    }

    const profileFeatures = [
        {
            icon: UserCircle,
            title: "Display Information",
            description: "Update your public display name and photo.",
            href: "/profile/display",
        },
        {
            icon: FileText,
            title: "Legal Name",
            description: "Manage your legal first, middle, and last name.",
            href: "/profile/name",
        },
        {
            icon: HeartHandshake,
            title: "Demographics",
            description: "Update your date of birth and gender.",
            href: "/profile/demographics",
        },
        {
            icon: AtSign,
            title: "NeupID",
            description: "Manage your unique NeupIDs.",
            href: "/profile/neupid",
        },
        {
            icon: Contact,
            title: "Contact Information",
            description: "Manage your phone numbers and addresses.",
            href: "/profile/contact",
        },
        {
            icon: ShieldCheck,
            title: "KYC & Verification",
            description: "Submit documents to verify your identity.",
            href: "/profile/documents",
        },
    ];

    return (
        <div className="grid gap-8">
            <PrimaryHeader
                title="Profile"
                description={
                    accountProfile.accountType === 'brand'
                        ? "Manage the selected account's profile details, contact info, and verification."
                        : "Manage your personal details, contact info, and identity verification."
                }
            />

            <Card>
                <CardContent className="divide-y p-0">
                    {profileFeatures.map((feature, index) => (
                        <ListItem key={index} {...feature} />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
