

import { notFound } from "next/navigation";
import { getUserDetails, getAccountDetails } from "@/services/manage/users";
import { BlockServiceAccessForm, SendWarningForm } from "../forms";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";


export default async function UserNoticePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const userDetails = await getUserDetails(id);
     if (!userDetails) {
        notFound();
    }
    
    const accountDetails = await getAccountDetails(id);

    return (
        <div className="grid gap-8">
            <div className="space-y-4">
                <BackButton href={`/manage/${id}`} />
                 <PrimaryHeader
                    title="Manage Notices & Actions"
                    description={`Send warnings or apply administrative actions to @${userDetails.neupId}.`}
                />
            </div>
            
            <SendWarningForm userId={userDetails.accountId} />

            <div className="border-t pt-8">
                <BlockServiceAccessForm 
                    userId={userDetails.accountId} 
                    currentBlock={accountDetails?.block || null} 
                />
            </div>
        </div>
    );
}
