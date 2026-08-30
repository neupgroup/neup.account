import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { DeletionManager } from "./form";

export default async function UserDeletionPage({ params }: { params: Promise<{ id: string }> }) {
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
                    title="Account Deletion"
                    description={`Manage the deletion process for @${userDetails.neupId}.`}
                />
            </div>
            
            <DeletionManager accountId={userDetails.accountId} />
        </div>
    );
}
