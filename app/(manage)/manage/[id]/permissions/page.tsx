import { notFound } from "next/navigation";
import { getUserDetails, getAccountRoles, getAvailableRoles } from "@/services/manage/users";
import { BackButton } from "#/components/element/backButton";
import { RoleEditor } from "./form";
import { TitleSet } from '#/components/element/titleset';

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
            <TitleSet level={1}
                title="Manage Roles"
                subtitle={`Assign roles to @${userDetails.neupId}. Roles determine what the account can access.`}
            />
            <RoleEditor
                accountId={id}
                availableRoles={availableRoles}
                initialAssignedRoleIds={assignedRoles.map((r) => r.id)}
            />
        </div>
    );
}
