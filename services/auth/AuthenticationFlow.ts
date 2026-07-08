'use server';

import prisma from '@/core/helpers/prisma';
import { randomUUID } from 'crypto';

// Expiry thresholds in minutes
const EXPIRY_WITH_PASSWORD_MINUTES = 10;
const EXPIRY_WITHOUT_PASSWORD_MINUTES = 20;

/**
 * Creates a new authentication request with the given type and initializes the flow.
 */
export async function createAuthnRequest(type: 'signup' | 'signin' | 'forgot_password') {
    const requestId = randomUUID();
    const createdAt = new Date();
    
    // Initially, expiresAt is set based on the flow type.
    // For signup/signin, it starts at 20 minutes (no password yet).
    const expiresAt = new Date(createdAt);
    expiresAt.setMinutes(expiresAt.getMinutes() + EXPIRY_WITHOUT_PASSWORD_MINUTES);

    await prisma.authnRequest.create({
        data: {
            id: requestId,
            type,
            status: 'pending',
            data: { hasPassword: false },
            createdAt,
            expiresAt,
        },
    });

    return requestId;
}

/**
 * Resets the authentication request. If a requestId is provided,
 * the old request is expired before creating a new one.
 */
export async function resetAuthnRequest(requestId?: string) {
    if (requestId) {
        // Expire the old request
        await prisma.authnRequest.update({
            where: { id: requestId },
            data: { status: 'expired' },
        });
    }

    // Create a fresh request (caller should specify type via other functions)
    return createAuthnRequest('signin');
}

/**
 * Updates the authentication request type. This creates a new request
 * with the new type and expires the previous one.
 */
export async function updateAuthnRequestType(
    previousRequestId: string,
    newFlowType: 'signup' | 'signin' | 'forgot_password'
) {
    // Expire the old request
    await prisma.authnRequest.update({
        where: { id: previousRequestId },
        data: { status: 'expired' },
    });

    // Create a new request with the new flow type
    return createAuthnRequest(newFlowType);
}

/**
 * Updates a NeupID in the authentication request. Expires the previous request.
 */
export async function updateAuthnRequestNeupId(previousRequestId: string) {
    // Expire the old request
    await prisma.authnRequest.update({
        where: { id: previousRequestId },
        data: { status: 'expired' },
    });

    // The caller can re-initialize with a new request if needed
    // This function mainly signals that a neupId update occurred
}

/**
 * Wrapper to create a signin-specific authentication request.
 */
export async function createSigninAuthnRequest() {
    return createAuthnRequest('signin');
}

/**
 * Wrapper to create a signup-specific authentication request.
 */
export async function createSignupAuthnRequest() {
    return createAuthnRequest('signup');
}

/**
 * Wrapper to create a forgot-password authentication request.
 */
export async function createForgetpassAuthnRequest() {
    return createAuthnRequest('forgot_password');
}

/**
 * Validates if an authentication request is still valid.
 * 
 * Rules:
 * - If status is 'expired', it's invalid.
 * - For signup/signin:
 *   - If no password provided: valid for 20 minutes from last data update or creation.
 *   - If password provided: valid for 10 minutes from when password was added.
 *   - If user goes back and removes password, expiresAt resets to 20 minutes from now.
 * 
 * Returns { valid: boolean; reason?: string }
 */
export async function isValidRequest(requestId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
        const request = await prisma.authnRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            return { valid: false, reason: 'Request not found' };
        }

        // If explicitly expired, it's invalid
        if (request.status === 'expired') {
            return { valid: false, reason: 'Request is expired' };
        }

        const now = new Date();

        // Check if the request has passed its expiry time
        if (request.expiresAt && request.expiresAt < now) {
            return { valid: false, reason: 'Request has exceeded expiry time' };
        }

        // For signup and signin flows, apply special logic
        if (request.type === 'signup' || request.type === 'signin') {
            const data = request.data as Record<string, any> || {};
            const hasPassword = data.hasPassword === true;

            if (hasPassword) {
                // If password exists, the expiry was already set to 10 minutes when password was added
                return { valid: true };
            } else {
                // If no password yet, allow extensions until password is added (20 min window)
                // The expiresAt will be automatically extended when new data is added
                return { valid: true };
            }
        }

        // For forgot_password, just check expiry time
        return { valid: true };
    } catch (error) {
        return { valid: false, reason: 'Error validating request' };
    }
}

/**
 * Updates the authentication request data and manages expiry logic.
 * 
 * This function should be called whenever the user updates form data.
 * It handles:
 * - Extending the timer when new data is added (if no password yet)
 * - Setting a 10-minute expiry when password is added
 * - Resetting to 20-minute expiry if password is removed
 */
export async function updateAuthnRequestData(
    requestId: string,
    newData: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
    try {
        const request = await prisma.authnRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        const currentData = (request.data as Record<string, any>) || {};
        const hadPassword = currentData.hasPassword === true;
        const nowHasPassword = newData.hasPassword === true;

        const now = new Date();
        let expiresAt = request.expiresAt;

        if (request.type === 'signup' || request.type === 'signin') {
            if (!hadPassword && nowHasPassword) {
                // Password is being added: set expiry to 10 minutes from now
                expiresAt = new Date(now);
                expiresAt.setMinutes(expiresAt.getMinutes() + EXPIRY_WITH_PASSWORD_MINUTES);
            } else if (hadPassword && !nowHasPassword) {
                // Password is being removed: reset expiry to 20 minutes from now
                expiresAt = new Date(now);
                expiresAt.setMinutes(expiresAt.getMinutes() + EXPIRY_WITHOUT_PASSWORD_MINUTES);
            } else if (!hadPassword && !nowHasPassword) {
                // No password in either state: extend the timer to 20 minutes from now if any data exists
                const hasAnyData = Object.keys(newData).some(key => key !== 'hasPassword' && newData[key]);
                if (hasAnyData) {
                    expiresAt = new Date(now);
                    expiresAt.setMinutes(expiresAt.getMinutes() + EXPIRY_WITHOUT_PASSWORD_MINUTES);
                }
            }
            // If password exists in both states, keep the existing expiry (10-min countdown)
        }

        await prisma.authnRequest.update({
            where: { id: requestId },
            data: {
                data: newData,
                expiresAt,
            },
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to update request data' };
    }
}

/**
 * Completes an authentication request after successful authentication.
 */
export async function completeAuthnRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.authnRequest.update({
            where: { id: requestId },
            data: { status: 'completed' },
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to complete request' };
    }
}

/**
 * Legacy/backward-compatible function to initialize auth flow.
 * Checks if a request exists and is valid for the given flow type.
 * If type differs, creates a new request with the new type.
 */
export async function initializeAuthFlow(
    currentId: string | null,
    flowType: 'signup' | 'signin' | 'forgot_password'
): Promise<string> {
    if (currentId) {
        const authRequest = await prisma.authnRequest.findUnique({
            where: { id: currentId },
        });

        if (authRequest && authRequest.expiresAt > new Date()) {
            // If the type matches or is being updated, update it and return the same ID
            if (authRequest.type !== flowType) {
                const newId = await updateAuthnRequestType(currentId, flowType);
                return newId;
            }
            return currentId;
        }
    }

    // If no valid request, create a new one
    return createAuthnRequest(flowType);
}

/**
 * Checks if a password has been provided in the authentication request.
 * Returns the appropriate expiry time in minutes.
 * 
 * Returns: 10 if password exists, 20 if no password
 */
export async function isPasswordPassed(requestId: string): Promise<number> {
    try {
        const request = await prisma.authnRequest.findUnique({
            where: { id: requestId },
            select: { data: true },
        });

        if (!request) {
            return EXPIRY_WITHOUT_PASSWORD_MINUTES;
        }

        const data = request.data as Record<string, any> || {};
        const hasPassword = data.hasPassword === true || Boolean(data.password);

        return hasPassword ? EXPIRY_WITH_PASSWORD_MINUTES : EXPIRY_WITHOUT_PASSWORD_MINUTES;
    } catch (error) {
        return EXPIRY_WITHOUT_PASSWORD_MINUTES;
    }
}

/**
 * Removes authentication data from the request.
 * Specifically removes: password, otp, and other sensitive auth details.
 * Updates the expiresAt to 20 minutes from now if data was cleared.
 */
export async function removeAuthDataFromRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const request = await prisma.authnRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        const currentData = (request.data as Record<string, any>) || {};

        // Remove sensitive authentication fields
        const fieldsToRemove = ['password', 'otp', 'pin', 'verificationCode', 'securityAnswer'];
        const updatedData = { ...currentData };
        
        let dataWasModified = false;
        for (const field of fieldsToRemove) {
            if (field in updatedData) {
                delete updatedData[field];
                dataWasModified = true;
            }
        }

        // Mark password as not present
        updatedData.hasPassword = false;

        // If data was modified, reset the expiry to 20 minutes
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMinutes(expiresAt.getMinutes() + EXPIRY_WITHOUT_PASSWORD_MINUTES);

        await prisma.authnRequest.update({
            where: { id: requestId },
            data: {
                data: updatedData,
                expiresAt,
            },
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to remove auth data from request' };
    }
}
