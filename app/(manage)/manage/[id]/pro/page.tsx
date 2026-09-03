import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "#/components/element/backButton";
import { TitleSet } from '#/components/element/titleset';
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
                <TitleSet level={1}
                    title="Neup.Pro Management"
                    subtitle={`Activate or deactivate the Neup.Pro subscription for @${userDetails.neupId}.`}
                />
            </div>
            
            <NeupProManager accountId={userDetails.accountId} />
        </div>
    );
}
