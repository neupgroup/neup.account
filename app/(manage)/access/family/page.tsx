import { Card, CardContent } from "@/components/ui/card";
import { getFamilyGroups } from "@/services/manage/people/family";
import { FamilyManager } from "@/app/(manage)/people/family/family-manager";
import { PartnerManager } from "@/app/(manage)/people/family/partner-manager";
import { BackButton } from "@/components/ui/back-button";
import { getPersonalAccountId } from '@/core/auth/verify';
import { getUserProfile, checkPermissions } from '@/services/user';
import { notFound } from "next/navigation";
import { SecondaryHeader } from "@/components/ui/secondary-header";

export default async function FamilySharingPage() {
    const canView = await checkPermissions(['people.family.view']);
    if (!canView) {
        notFound();
    }
    
    const personalId = await getPersonalAccountId();
    if (!personalId) return <p>Please log in.</p>;

    const [familyGroups, canAddFamily, canAddPartner] = await Promise.all([
        getFamilyGroups(),
        checkPermissions(['people.family.add']),
        checkPermissions(['people.family.partner.add']),
    ]);

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
                    const isOwner = group.createdBy === personalId;
                    const canAddMoreFamily = group.members.filter(m => !m.hidden).length < 5;
                    const ownerProfile = await getUserProfile(group.createdBy);
                    const ownerName = ownerProfile?.nameDisplay || `${ownerProfile?.nameFirst} ${ownerProfile?.nameLast}`.trim() || 'A User';

                    return (
                        <div key={group.id} className="space-y-2">
                             <SecondaryHeader
                                title={isOwner ? "Your Family Group" : `Family of ${ownerName}`}
                                description={isOwner ? "You can add up to 5 members." : "You are a member of this family."}
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
                    <SecondaryHeader
                        title="Your Family"
                        description="You haven't created or joined a family yet. Invite someone to start one!"
                    />
                     <Card>
                        <CardContent className="p-6">
                            <FamilyManager familyGroup={{ id: 'temp', createdBy: personalId, members: [] }} canAddMore={true} isOwner={true} />
                        </CardContent>
                    </Card>
                 </div>
            ) : null }
            
             {canAddPartner && (
                <div className="space-y-2">
                    <SecondaryHeader
                        title="Add Your Partner (Private)"
                        description="Add one partner to your family group. This relationship can be kept private from other family members or made public."
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
