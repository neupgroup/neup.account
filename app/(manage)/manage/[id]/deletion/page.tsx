import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "#/components/element/backButton";
import { TitleSet } from '#/components/element/titleset';
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
                <TitleSet level={1}
                    title="Account Deletion"
                    subtitle={`Manage the deletion process for @${userDetails.neupId}.`}
                />
            </div>
            
            <DeletionManager accountId={userDetails.accountId} />
        </div>
    );
}
