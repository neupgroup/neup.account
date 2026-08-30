import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { NeupProManager } from "./form";

export default async function UserProPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const userDetails = await getUserDetails(id);
    if (!userDetails) {
        notFound();
    }
    
    return (
        <div className="grid gap-8">
            <div className="space-y-4">
                <BackButton href={`/manage/${id}`} />
                <PrimaryHeader
                    title="Neup.Pro Management"
                    description={`Activate or deactivate the Neup.Pro subscription for @${userDetails.neupId}.`}
                />
            </div>
            
            <NeupProManager accountId={userDetails.accountId} />
        </div>
    );
}
