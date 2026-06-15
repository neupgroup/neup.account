import React from "react";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ListItem } from "@/components/ui/list-item";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { UserCircle, FileText, HeartHandshake, AtSign, Contact, ShieldCheck } from "@/components/icons";
import { getActiveAccountId, getPersonalAccountId } from "@/core/auth/verify";
import { checkGrantedPermissions, checkPermissions, getUserProfile } from "@/services/user";
import { logSystemError } from "@/core/helpers/logger";
import { PROFILE_NAV_PERMISSIONS, PROFILE_SECTION_PERMISSIONS } from "@/core/auth/profile-permissions";

function isDebuggingEnabled() {
    return (
        process.env.NODE_ENV !== 'production' ||
        process.env.DEBUGGING_MODE === 'true' ||
        process.env.debugging_mode === 'true'
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

    const accountProfile = await getUserProfile(accountId);
    if (!accountProfile) {
        notFound();
    }

    const isManaging = accountId !== personalAccountId;

    const canViewProfile = isManaging
        ? await Promise.all(PROFILE_NAV_PERMISSIONS.map((permission) => checkGrantedPermissions([permission], personalAccountId, accountId)))
            .then((results) => results.some(Boolean))
        : await Promise.all(PROFILE_NAV_PERMISSIONS.map((permission) => checkPermissions([permission])))
            .then((results) => results.some(Boolean));

    if (!canViewProfile) {
        if (isDebuggingEnabled()) {
            const denialMessage = `Missing profile permissions for account "${personalAccountId}" while viewing selected account "${accountId}".`;
            // eslint-disable-next-line no-console
            console.error(denialMessage);
            await logSystemError(denialMessage, 'profile.page.permission_denied');
        }

        notFound();
    }

    const profileFeatures = [
        {
            permissions: PROFILE_SECTION_PERMISSIONS.display,
            icon: UserCircle,
            title: "Display Information",
            description: "Update your public display name and photo.",
            href: "/profile/display",
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.legal,
            icon: FileText,
            title: "Legal Name",
            description: "Manage your legal first, middle, and last name.",
            href: "/profile/name",
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.demographics,
            icon: HeartHandshake,
            title: "Demographics",
            description: "Update your date of birth and gender.",
            href: "/profile/demographics",
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.neupid,
            icon: AtSign,
            title: "NeupID",
            description: "Manage your unique NeupIDs.",
            href: "/profile/neupid",
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.contact,
            icon: Contact,
            title: "Contact Information",
            description: "Manage your phone numbers and addresses.",
            href: "/profile/contact",
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.kyc,
            icon: ShieldCheck,
            title: "KYC & Verification",
            description: "Submit documents to verify your identity.",
            href: "/profile/documents",
        },
    ];

    const visibleProfileFeatures = (
        await Promise.all(
            profileFeatures.map(async (feature) => {
                const canAccess = isManaging
                    ? await Promise.all(
                        feature.permissions.map((permission) => checkGrantedPermissions([permission], personalAccountId, accountId))
                    ).then((results) => results.some(Boolean))
                    : await Promise.all(
                        feature.permissions.map((permission) => checkPermissions([permission]))
                    ).then((results) => results.some(Boolean));

                return canAccess ? feature : null;
            })
        )
    ).filter((feature): feature is (typeof profileFeatures)[number] => feature !== null);

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
                    {visibleProfileFeatures.map((feature, index) => (
                        <ListItem key={index} {...feature} />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
