
'use server';

import { permission } from "@/logica/permission";
import { z } from "zod";
import { getActiveAccountId } from "@/services/account/verify";
import { logActivity } from "@/services/log-actions";
import { logError } from "@/core/helpers/logger";
import prisma from "@/core/helpers/prisma";
import bcrypt from "bcryptjs";
import { logoutActiveSession } from "@/services/account/logout";
import { requireAnyPermission404 } from "@/services/account/permission-guards";
import { DATA_PRIVACY_PERMISSION_GROUPS } from "@/core/account/data-permissions";

const formSchema = z.object({
    password: z.string().min(1, "Password is required to request deletion."),
});

const servicePermissions = [
  permission("data.delete_account.start", "for_individual", "service"),
];

/**
 * Function requestAccountDeletion.
 */
export async function requestAccountDeletion(data: z.infer<typeof formSchema>, geolocation?: string): Promise<{ success: boolean; error?: string; }> {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deleteAccount);

  const accountId = await getActiveAccountId();
  if (!accountId) {
    return { success: false, error: "User not authenticated." };
  }

  const validation = formSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.flatten().fieldErrors.password?.[0] };
  }
  const { password } = validation.data;

  try {
    const [account, authData] = await Promise.all([
        prisma.account.findUnique({ where: { id: accountId } }),
        prisma.authnMethod.findFirst({
            where: {
                accountId,
                type: 'password',
                order: 'primary',
                status: 'active',
            },
            select: { value: true },
        })
    ]);
    
    if (account && account.status === 'deletion_requested') {
        return { success: false, error: "Your account is already scheduled for deletion." };
    }

    if (!authData) {
        await logActivity(accountId, 'Account Deletion Request Failed', 'Failed', undefined, undefined, geolocation);
        return { success: false, error: "Authentication data not found." };
    }
    const isMatch = await bcrypt.compare(password, authData.value);
    if (!isMatch) {
        await logActivity(accountId, 'Account Deletion Request Failed', 'Failed', undefined, undefined, geolocation);
        return { success: false, error: "The password you entered is incorrect." };
    }
    
    await prisma.$transaction([
        // Update the status in the account document
        prisma.account.update({
            where: { id: accountId },
            data: { status: 'deletion_requested' }
        }),
        prisma.activity.create({
            data: {
                memberId: accountId,
                actorAccountId: accountId,
                action: 'Account status changed to deletion_requested. User initiated deletion request.',
                status: 'Pending',
                ip: 'system',
                timestamp: new Date(),
                geolocation,
            }
        })
    ]);

    await logActivity(accountId, "Account Deletion Requested", "Success", undefined, undefined, geolocation);
    await logoutActiveSession();

    return { success: true };

  } catch (error) {
    await logError("database", error, `requestAccountDeletion: ${accountId}`);
    return { success: false, error: "An unexpected error occurred." };
  }
}


/**
 * Function cancelAccountDeletion.
 */
export async function cancelAccountDeletion(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.account.update({
            where: { id: accountId },
            data: { status: 'active' }
        });

        await logActivity(accountId, "Account Deletion Cancelled", "Success");
        return { success: true };
    } catch (error) {
        await logError('database', error, `cancelAccountDeletion: ${accountId}`);
        return { success: false, error: "Failed to cancel account deletion." };
    }
}
