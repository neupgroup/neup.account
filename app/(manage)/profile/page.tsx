import React from "react";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ListItem } from "@/components/ui/list-item";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { UserCircle, FileText, HeartHandshake, AtSign, Contact, ShieldCheck } from "@/components/icons";
import { checkGrantedPermissions, checkPermissions, getUserProfile } from "@/services/user";
import { logSystemError } from "@/neup.core/helpers/logger";
import { PROFILE_NAV_PERMISSIONS, PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from "@/neup.core/auth/profile-permissions";
import { getAccountSelectorContext } from "@/neup.core/auth/accountSelector";
import { resolveAccessProfileContext } from "@/neup.core/auth/access-profile-context";
import { permission } from '@/neup.logica/permission';

/**
 * ::neup.documentation::profile-options-page
 * ::title Profile Options Page
 *
 * Renders the profile section menu for the active account or for a URL-selected profile.
 *
 * ::public
 *
 * `/profile?selectedProfile=[id]` shows the available profile information options for the selected profile without switching the current account.
 *
 * ::public end
 *
 * ::private
 *
 * Selected-profile mode uses the same selected/working profile resolver as access pages, then filters section links from the resolved permission snapshot.
 *
 * ::private end
 *
 * ::end
 */

const pagePermissions = [
    permission('profile.display.view.self', 'for_individual', 'page'),
    permission('profile.display.update.self', 'for_individual', 'page'),
    permission('profile.display.view.managed', 'for_individual', 'page'),
    permission('profile.display.update.managed', 'for_individual', 'page'),
    permission('profile.display.view.root', 'for_individual', 'page'),
    permission('profile.display.update.root', 'for_individual', 'page'),
    permission('profile.legal.view.self', 'for_individual', 'page'),
    permission('profile.legal.update.self', 'for_individual', 'page'),
    permission('profile.demographics.view.self', 'for_individual', 'page'),
    permission('profile.demographics.update.self', 'for_individual', 'page'),
    permission('profile.neupid.view.self', 'for_individual', 'page'),
    permission('profile.neupid.update.self', 'for_individual', 'page'),
    permission('profile.neupid.request.self', 'for_individual', 'page'),
    permission('profile.neupid.remove.self', 'for_individual', 'page'),
    permission('profile.contact.view.self', 'for_individual', 'page'),
    permission('profile.contact.update.self', 'for_individual', 'page'),
    permission('profile.kyc.view.self', 'for_individual', 'page'),
    permission('profile.kyc.update.self', 'for_individual', 'page'),
];

function isDebuggingEnabled() {
    return (
        process.env.NODE_ENV !== 'production' ||
        process.env.DEBUGGING_MODE === 'true' ||
        process.env.debugging_mode === 'true'
    );
}

type PageProps = {
    searchParams: Promise<{ selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

export default async function ProfilePage({ searchParams }: PageProps) {
    const { selectedProfile, mode, workingProfile } = await searchParams;
    const selectorContext = await getAccountSelectorContext();
    const selectedProfileContext = selectedProfile
        ? await resolveAccessProfileContext({
            selectedProfile,
            workingProfile,
            requiredPermissions: PROFILE_NAV_PERMISSIONS,
        })
        : null;

    if (selectedProfile && !selectedProfileContext) {
        notFound();
    }

    const accountId = selectedProfileContext?.selectedProfile ?? selectorContext.activeAccountId;
    const personalAccountId = selectedProfileContext?.signedInProfile ?? selectorContext.personalAccountId;
    const isManaging = selectedProfileContext
        ? !selectedProfileContext.isSelf
        : selectorContext.isManagingOtherAccount;

    if (!accountId) {
        notFound();
    }

    if (!personalAccountId) {
        notFound();
    }

    const accountProfile = await getUserProfile(accountId);
    if (!accountProfile) {
        notFound();
    }

    const canViewProfile = selectedProfileContext
        ? hasAnyPermission(selectedProfileContext.permissions, PROFILE_NAV_PERMISSIONS)
        : isManaging
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

    const profileContextParams = new URLSearchParams();
    if (selectedProfileContext) profileContextParams.set('selectedProfile', selectedProfileContext.selectedProfile);
    if (mode) profileContextParams.set('mode', mode);
    if (workingProfile) profileContextParams.set('workingProfile', workingProfile);
    const profileContextQuery = profileContextParams.toString()
        ? `?${profileContextParams.toString()}`
        : '';

    const profileFeatures = [
        {
            permissions: PROFILE_SECTION_PERMISSIONS.display,
            icon: UserCircle,
            title: "Display Information",
            description: "Update your public display name and photo.",
            href: `/profile/display${profileContextQuery}`,
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.legal,
            icon: FileText,
            title: "Legal Name",
            description: "Manage your legal first, middle, and last name.",
            href: `/profile/legal${profileContextQuery}`,
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.demographics,
            icon: HeartHandshake,
            title: "Demographics",
            description: "Update your date of birth and gender.",
            href: `/profile/demographics${profileContextQuery}`,
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.neupid,
            icon: AtSign,
            title: "NeupID",
            description: "Manage your unique NeupIDs.",
            href: `/profile/neupid${profileContextQuery}`,
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.contact,
            icon: Contact,
            title: "Contact Information",
            description: "Manage your phone numbers and addresses.",
            href: `/profile/contact${profileContextQuery}`,
        },
        {
            permissions: PROFILE_SECTION_PERMISSIONS.kyc,
            icon: ShieldCheck,
            title: "KYC & Verification",
            description: "Submit documents to verify your identity.",
            href: `/profile/documents${profileContextQuery}`,
        },
    ];

    const availableProfileFeatures = accountProfile.accountType === 'brand'
        ? profileFeatures.filter((feature) => !feature.href.startsWith('/profile/demographics'))
        : profileFeatures;

    const visibleProfileFeatures = (
        await Promise.all(
            availableProfileFeatures.map(async (feature) => {
                const canAccess = selectedProfileContext
                    ? hasAnyPermission(selectedProfileContext.permissions, feature.permissions)
                    : isManaging
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
