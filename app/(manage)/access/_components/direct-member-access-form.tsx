"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck } from "@/components/icons";
import { useToast } from "@/neup.core/hooks/use-toast";
import {
  updateDirectMemberAccess,
  type DirectAccessAssignableRole,
} from "./actions";

const CUSTOM_ROLE_PREFIX = "account.access.";

/**
 * ::neup.documentation::direct-member-access-form
 * ::title Direct Member Access Form
 *
 * Lets an account owner or manager replace the direct-account role set for one member.
 *
 * ::public
 *
 * The form preserves the current `selectedProfile` or legacy `selectedAccount` query param so updates apply to the selected account instead of always defaulting to the signed-in account.
 *
 * ::public end
 *
 * ::end
 */
export function DirectMemberAccessForm({
  memberAccountId,
  memberDisplayName,
  roles,
  assignedRoleIds,
}: {
  memberAccountId: string;
  memberDisplayName: string;
  roles: DirectAccessAssignableRole[];
  assignedRoleIds: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    () => new Set(assignedRoleIds.filter((roleId) => !roleId.startsWith(CUSTOM_ROLE_PREFIX))),
  );
  const [isPending, startTransition] = useTransition();

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((current) => {
      const next = new Set(current);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateDirectMemberAccess({
        memberAccountId,
        roleIds: Array.from(selectedRoleIds),
        selectedAccountId:
          searchParams.get("selectedProfile") ??
          searchParams.get("selectedAccount") ??
          searchParams.get("workingProfile"),
      });

      if (result.success) {
        toast({
          title: "Access updated",
          description: `Roles were updated for ${memberDisplayName}.`,
          className: "bg-accent text-accent-foreground",
        });
        router.refresh();
        return;
      }

      toast({
        variant: "destructive",
        title: "Could not update access",
        description: result.error ?? "An unexpected error occurred.",
      });
    });
  };

  return (
    <Card>
      <CardContent className="grid gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Assign direct access</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Set the roles this member should hold on the selected account.
            </p>
          </div>
          <Badge variant="outline">
            {selectedRoleIds.size} role{selectedRoleIds.size !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="grid gap-2">
          <div>
            <h3 className="text-sm font-semibold">Roles</h3>
            <p className="text-xs text-muted-foreground">Reusable role grants for this account.</p>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            {roles.length > 0 ? (
              roles.map((role) => {
                const checked = selectedRoleIds.has(role.id);
                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleRole(role.id)}
                      disabled={isPending}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      )}
                    </div>
                    {checked && <Badge variant="secondary">Selected</Badge>}
                  </label>
                );
              })
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No assignable roles are available.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Saving replaces direct role assignments on this selected account. Portfolio asset roles are unchanged.
          </p>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
