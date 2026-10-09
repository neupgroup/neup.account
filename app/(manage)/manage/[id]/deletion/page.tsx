import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "@neup/components/element/backButton";
import { TitleSet } from '@neup/components/element/titleset';
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
                <BackButton backsTo={`/manage/${id}`} />
                <TitleSet level={1}
                    title="Account Deletion"
                    subtitle={`Manage the deletion process for @${userDetails.neupId}.`}
                    titleClassName="text-2xl leading-8"
                    subtitleClassName="text-sm leading-6"
                />
            </div>
            
            <DeletionManager accountId={userDetails.accountId} />
        </div>
    );
}
