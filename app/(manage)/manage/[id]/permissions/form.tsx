"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/core/hooks/use-toast";
import { updateAccountRoles } from "@/services/manage/users";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "@/components/icons";

type Role = {
    id: string;
    name: string;
    description: string | null;
};

export function RoleEditor({
    accountId,
    availableRoles,
    initialAssignedRoleIds,
}: {
    accountId: string;
    availableRoles: Role[];
    initialAssignedRoleIds: string[];
}) {
    const [assignedIds, setAssignedIds] = useState<Set<string>>(
        new Set(initialAssignedRoleIds),
    );
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const toggle = (roleId: string) => {
        setAssignedIds((prev) => {
            const next = new Set(prev);
            if (next.has(roleId)) next.delete(roleId);
            else next.add(roleId);
            return next;
        });
    };

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateAccountRoles(accountId, Array.from(assignedIds));
            if (result.success) {
                toast({
                    title: "Roles updated",
                    description: "The account's role assignments have been saved.",
                    className: "bg-accent text-accent-foreground",
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.error,
                });
            }
        });
    };

    if (availableRoles.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No roles are available for assignment. Create roles in the system first.
            </p>
        );
    }

    return (
        <div className="grid gap-6">
            {/* Role list — same grouped card style */}
            <div>
                {availableRoles.map((role, i) => {
                    const isAssigned = assignedIds.has(role.id);
                    const isFirst = i === 0;
                    const isLast = i === availableRoles.length - 1;

                    const roundingClass =
                        isFirst && isLast ? 'rounded-lg'
                        : isFirst          ? 'rounded-t-lg'
                        : isLast           ? 'rounded-b-lg'
                        : '';

                    return (
                        <button
                            key={role.id}
                            type="button"
                            onClick={() => toggle(role.id)}
                            className={`
                                w-full flex items-center gap-4 px-4 py-3.5 text-left
                                border border-border bg-card
                                hover:bg-accent/40 transition-colors
                                ${roundingClass}
                                ${!isFirst ? '-mt-px' : ''}
                                ${isAssigned ? 'bg-primary/5' : ''}
                            `}
                        >
                            {/* Checkbox indicator */}
                            <div
                                className={`
                                    h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                                    ${isAssigned
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : 'border-border bg-background'}
                                `}
                            >
                                {isAssigned && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </div>

                            {/* Role info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">{role.name}</p>
                                {role.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {role.description}
                                    </p>
                                )}
                            </div>

                            {/* Assigned badge */}
                            {isAssigned && (
                                <span className="shrink-0 text-xs font-medium text-primary">
                                    Assigned
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    {assignedIds.size} role{assignedIds.size !== 1 ? 's' : ''} selected
                </p>
                <Button onClick={handleSave} disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
