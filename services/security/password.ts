'use server';

import { permission } from '@/logica/permission';
import { z } from 'zod';
import { getActiveAccountId } from '@/core/auth/verify';
import { checkPermissions } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { logError } from '@/core/helpers/logger';
import { changePasswordSchema } from '@/services/security/schema';
import { createNotification } from '../notifications';
import { changePassword as changePasswordForAccount } from '@/services/auth/password';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';

const servicePermissions = [
    permission('security.pass.modify', 'for_individual', 'service'),
];

/**
 * Function changePassword.
 */
export async function changePassword(data: z.infer<typeof changePasswordSchema>, geolocation?: string) {
    await requireAnyPermission404(['security.pass.modify']);
    const hasPermission = await checkPermissions(['security.pass.modify']);
    if (!hasPermission) {
        return { success: false, error: "You don't have permission to change the password." };
    }

    const accountId = await getActiveAccountId();
    if (!accountId) {
        return { success: false, error: "User not authenticated." };
    }

    const validation = changePasswordSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided.", details: validation.error.flatten() };
    }

    const { currentPassword, newPassword } = validation.data;

    try {
        const changeResult = await changePasswordForAccount({
            accountId,
            currentPassword,
            newPassword,
            minLength: 8,
        });

        if (!changeResult.success) {
            await logActivity(accountId, 'Password Change Failed', 'Failed', undefined, undefined, geolocation);
            return { success: false, error: changeResult.error || "The current password you entered is incorrect." };
        }
        
        await logActivity(accountId, activityAction.passwordChanged(), 'Success', undefined, undefined, geolocation);
        
        await createNotification({
            recipient_id: accountId,
            action: 'informative.security',
            message: 'Your password was changed successfully.',
        });

        return { success: true, message: "Password updated successfully." };

    } catch (error) {
        await logError('database', error, `changePassword: ${accountId}`);
        return { success: false, error: "An unexpected error occurred." };
    }
}
