'use server';

import { permission } from "@/logica/permission";
import { z } from "zod";
import { getActiveAccountId } from "@/logica/account/verify";
import { logActivity } from "@/services/log-actions";
import { logError } from "@/core/helpers/logger";
import prisma from "@/core/helpers/prisma";
import bcrypt from "bcryptjs";
import { requireAnyPermission404 } from "@/logica/account/permission-guards";
import { DATA_PRIVACY_PERMISSION_GROUPS } from "@/logica/account/data-permissions";

const formSchema = z.object({
    inactivityDays: z.string().min(1, "Please select a time period."),
    password: z.string().min(1, "Password is required to schedule deletion."),
});

const servicePermissions = [
    permission("data.materialization.view", "for_individual", "service"),
    permission("data.materialization.modify", "for_individual", "service"),
];


/**
 * Function scheduleMaterialization.
 */
export async function scheduleMaterialization(data: z.infer<typeof formSchema>, geolocation?: string): Promise<{ success: boolean; error?: string; }> {
    await requireAnyPermission404(DATA_PRIVACY_PERMISSION_GROUPS.materialization);

    const accountId = await getActiveAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }

    const validation = formSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided." };
    }
    const { inactivityDays, password } = validation.data;

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
            await logActivity(accountId, 'Materialization Schedule Failed', 'Failed', undefined, undefined, geolocation);
            return { success: false, error: "Authentication data not found." };
        }
        const isMatch = await bcrypt.compare(password, authData.value);
        if (!isMatch) {
            await logActivity(accountId, 'Materialization Schedule Failed', 'Failed', undefined, undefined, geolocation);
            return { success: false, error: "The password you entered is incorrect." };
        }
        
        // In a real application, you would store this preference in the database.
        // For now we'll just log it as per original logic, but we could add it to Account model if needed.
        await logActivity(accountId, `Scheduled Materialization for ${inactivityDays} days`, "Success", undefined, undefined, geolocation);

        console.log(
        `Materialization scheduled for accountId: ${accountId} after ${inactivityDays} days of inactivity.`
        );
        return { success: true };

    } catch (error) {
        await logError("database", error, `scheduleMaterialization: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}
