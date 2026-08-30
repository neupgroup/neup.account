import { notFound } from "next/navigation";
import { getUserDetails, getAccountRoles, getAvailableRoles } from "@/services/manage/users";
import { BackButton } from "@/components/ui/back-button";
import { RoleEditor } from "./form";
import { PrimaryHeader } from "@/components/ui/primary-header";

export default async function UserPermissionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const userDetails = await getUserDetails(id);
    if (!userDetails) {
        notFound();
    }

    const [assignedRoles, availableRoles] = await Promise.all([
        getAccountRoles(id),
        getAvailableRoles(),
    ]);

    return (
        <div className="grid gap-8">
            <BackButton href={`/manage/${id}`} />
            <PrimaryHeader
                title="Manage Roles"
                description={`Assign roles to @${userDetails.neupId}. Roles determine what the account can access.`}
            />
            <RoleEditor
                accountId={id}
                availableRoles={availableRoles}
                initialAssignedRoleIds={assignedRoles.map((r) => r.id)}
            />
        </div>
    );
}
