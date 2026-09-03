import type { Metadata } from 'next';
import { Card, CardContent } from "#/components/ui/card";
import { getFamilyGroups } from "@/services/manage/people/family";
import { FamilyManager } from "./family-manager";
import { PartnerManager } from "./partner-manager";
import { BackButton } from "#/components/element/backButton";
import { getActiveAccountId } from '@/services/account/verify';
import { getUserProfile, checkPermissions } from '@/services/user';
import { notFound } from "next/navigation";
import { TitleSet } from '#/components/element/titleset';
import { formMetadata } from '#/core/metadata';
import { permission } from '@/.neup/logica/permission';
import {
    ACCESS_FAMILY_MEMBER_UPDATE_PERMISSIONS,
    ACCESS_FAMILY_PARTNER_UPDATE_PERMISSIONS,
} from '@/inapp/permissions/access-view-permissions';

export const metadata: Metadata = formMetadata({ title: 'Family Management' });

const pagePermissions = [
    permission('access.family.member.update.self', 'for_individual', 'page'),
    permission('access.family.partner.update.self', 'for_individual', 'page'),
];

export default async function FamilySharingPage() {
    const activeAccountId = await getActiveAccountId();
    if (!activeAccountId) return <p>Please log in.</p>;

    const [canAddFamily, canAddPartner, activeProfile] = await Promise.all([
        checkPermissions([...ACCESS_FAMILY_MEMBER_UPDATE_PERMISSIONS]),
        checkPermissions([...ACCESS_FAMILY_PARTNER_UPDATE_PERMISSIONS]),
        getUserProfile(activeAccountId),
    ]);
    const allowsFamilySettings =
        activeProfile?.accountType === 'individual' || activeProfile?.accountType === 'dependent';
    if ((!canAddFamily && !canAddPartner) || !allowsFamilySettings) {
        notFound();
    }

    const familyGroups = await getFamilyGroups();

    return (
        <div className="grid gap-8">
            <BackButton href="/access" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Family Sharing</h1>
                <p className="text-muted-foreground">
                    Share your subscriptions and manage accounts with your family members.
                </p>
            </div>
            
            {familyGroups.length > 0 ? (
                familyGroups.map(async (group) => {
                    const isOwner = group.createdBy === activeAccountId;
                    const canAddMoreFamily = group.members.filter(m => !m.hidden).length < 5;
                    const ownerProfile = await getUserProfile(group.createdBy);
                    const ownerName = ownerProfile?.nameDisplay || `${ownerProfile?.nameFirst} ${ownerProfile?.nameLast}`.trim() || 'A User';

                    return (
                        <div key={group.id} className="space-y-2">
                             <TitleSet level={1}
                                title={isOwner ? "Your Family Group" : `Family of ${ownerName}`}
                                subtitle={isOwner ? "You can add up to 5 members." : "You are a member of this family."}
                             />
                            <Card>
                                <CardContent className="p-6">
                                    <FamilyManager familyGroup={group} canAddMore={canAddMoreFamily} isOwner={isOwner} />
                                </CardContent>
                            </Card>
                        </div>
                    );
                })
            ) : canAddFamily ? (
                 <div className="space-y-2">
                    <TitleSet level={1}
                        title="Your Family"
                        subtitle="You haven't created or joined a family yet. Invite someone to start one!"
                    />
                     <Card>
                        <CardContent className="p-6">
                            <FamilyManager familyGroup={{ id: 'temp', createdBy: activeAccountId, members: [] }} canAddMore={true} isOwner={true} />
                        </CardContent>
                    </Card>
                 </div>
            ) : null }
            
             {canAddPartner && (
                <div className="space-y-2">
                    <TitleSet level={1}
                        title="Add Your Partner (Private)"
                        subtitle="Add one partner to your family group. This relationship can be kept private from other family members or made public."
                    />
                    <Card>
                        <CardContent className="p-6">
                            <PartnerManager initialFamilyGroup={familyGroups[0] || null} />
                        </CardContent>
                    </Card>
                </div>
             )}
        </div>
    );
}
