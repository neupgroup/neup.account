'use server';

import { permission } from "@/logica/permission";
import { z } from "zod";
import { logActivity } from "@/services/log-actions";
import { logError } from "@/logica/logger/files";
import prisma from "@/core/helpers/prisma";
import bcrypt from "bcryptjs";
import { getActiveAccountId } from "@/services/account/verify";
import { logoutActiveSession } from "@/services/account/logout";
import { requireAnyPermission404 } from "@/services/account/permission-guards";
import { DATA_PRIVACY_PERMISSION_GROUPS } from "@/inapp/permissions/data-permissions";

const formSchema = z.object({
    password: z.string().min(1, "Password is required to deactivate your account."),
});

const servicePermissions = [
  permission("data.deactivate_account.start", "for_individual", "service"),
];


/**
 * Function deactivateAccount.
 */
export async function deactivateAccount(data: z.infer<typeof formSchema>, geolocation?: string): Promise<{ success: boolean; error?: string; }> {
  await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.deactivateAccount);

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
    const authData = await prisma.authnMethod.findFirst({
      where: {
        accountId,
        type: 'password',
        order: 'primary',
        status: 'active',
      },
      select: { value: true },
    });

    if (!authData) {
        await logActivity(accountId, 'Deactivation Failed', 'Failed', undefined, undefined, geolocation);
        return { success: false, error: "Authentication data not found." };
    }
    const isMatch = await bcrypt.compare(password, authData.value);
    if (!isMatch) {
        await logActivity(accountId, 'Deactivation Failed', 'Failed', undefined, undefined, geolocation);
        return { success: false, error: "The password you entered is incorrect." };
    }

    // In a real application, you would set a 'deactivated' flag on the user's account.
    await prisma.account.update({
        where: { id: accountId },
      data: { status: 'deactivated' }
    });
    await logActivity(accountId, "Account Deactivated", "Success", undefined, undefined, geolocation);
    
    // The most important part of deactivation is ending the current session.
    await logoutActiveSession();
    
    console.log(`Account deactivated for accountId: ${accountId}. User has been logged out.`);
    return { success: true };

  } catch (error) {
    await logError("database", error, `deactivateAccount: ${accountId}`);
    return { success: false, error: "An unexpected error occurred." };
  }
}
