
import { Card, CardContent } from "@/components/ui/card";
import React from "react";
import { checkPermissions } from '@/services/user';
import { ListItem } from "@/components/ui/list-item";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { Users, MailQuestion, Contact, UserX } from "@/components/icons";


export default async function PeopleSharingPage() {
    const [canViewFamily, canViewInvitations, canBlockUsers] = await Promise.all([
        checkPermissions(['people.family.view']),
        checkPermissions(['notification.read']),
        checkPermissions(['people.block_list.view', 'people.restrict_list.view'])
    ]);
    
    const sharingFeatures = [
        {
            icon: Users,
            title: "Family Sharing",
            description: "Manage your family group and shared subscriptions.",
            href: "/people/family",
            show: canViewFamily,
        },
        {
            icon: MailQuestion,
            title: "Invitations",
            description: "Accept or reject requests from other users.",
            href: "/people/invitations",
            show: canViewInvitations,
        },
        {
            icon: Contact,
            title: "Contact Info Sharing",
            description: "Control how your contact information is shared.",
            href: "#",
            show: false, // Not implemented yet
        },
        {
            icon: UserX,
            title: "Blocked Users",
            description: "Manage users you have blocked or restricted.",
            href: "/people/blocked",
            show: canBlockUsers,
        },
    ];

    const visibleFeatures = sharingFeatures.filter(f => f.show);

    return (
        <div className="grid gap-8">
            <PrimaryHeader
                title="People & Sharing"
                description="Control what you share and who you share it with across NeupID services."
            />
            
            <div className="grid gap-4">
                <SecondaryHeader
                    title="Sharing Settings"
                    description="Manage how your information is shared with other people."
                />
                <Card>
                    <CardContent className="divide-y p-0">
                        {visibleFeatures.length > 0 ? (
                            visibleFeatures.map((feature, index) => (
                                <ListItem key={index} {...feature} />
                            ))
                        ) : (
                             <div className="p-4 text-center text-sm text-muted-foreground">
                                You do not have permission to view sharing settings.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
